// ============================================================
//  MTC SYSTEM v2.0 — Apps Script Backend
//  Sheets: LOG_MTC | INOUT | Master_Sparepart | Stock_Report
//  Read-only: Master - Others (B=Teknisi, C=Mesin, E=Kategori)
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEETS = {
  LOG:    () => getOrCreate('LOG_MTC',    ['No Report','Tipe','Tanggal','Start','Finish','Durasi (menit)','Shift','Mesin','Area','Keluhan','Issue','Action Taken','Category','PIC']),
  INOUT:  () => getOrCreate('INOUT',      ['Timestamp','Tipe','Item ID','Nama','Qty','Harga','Lokasi','PIC','No Report','Keterangan']),
  MASTER: () => getOrCreate('Master_Sparepart', ['Item ID','Nama','Kategori','UoM','Lokasi','Harga','Min Qty','Status']),
  STOCK:  () => getOrCreate('Stock_Report',     ['Item ID','Nama','Kategori','Lokasi','Total IN','Total OUT','Current Stock','Harga','Min Qty','Status']),
  OTHER:  () => SS.getSheetByName('Master - Others')
};

// ============================================================
//  HELPER: GET OR CREATE SHEET
// ============================================================
function getOrCreate(name, headers) {
  let sh = SS.getSheetByName(name);
  if (!sh) {
    sh = SS.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold')
      .setBackground('#1e1e23')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ============================================================
//  SERVE WEB APP
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('oa')
    .setTitle('MTC System v2.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

// ============================================================
//  DATA LOADERS
// ============================================================
function getDaftarBarang() {
  const sh = SHEETS.MASTER();
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    result.push({
      id:     String(data[i][0]).trim(),
      nama:   String(data[i][1]).trim(),
      lokasi: String(data[i][4]).trim(),
      harga:  Number(data[i][5]) || 0,
      min:    Number(data[i][6]) || 0,
      stok:   getCurrentStock_(String(data[i][0]).trim())
    });
  }
  return result;
}

function getDaftarTeknisi() {
  const sh = SHEETS.OTHER();
  if (!sh) return [];
  return sh.getRange('B2:B').getValues()
    .map(r => String(r[0]).trim()).filter(Boolean);
}

function getDaftarMesin() {
  const sh = SHEETS.OTHER();
  if (!sh) return [];
  return sh.getRange('C2:C').getValues()
    .map(r => String(r[0]).trim()).filter(Boolean);
}

function getDaftarKategori() {
  const sh = SHEETS.OTHER();
  if (!sh) return [];
  const vals = sh.getRange('E2:E').getValues()
    .map(r => String(r[0]).trim()).filter(Boolean);
  return [...new Set(vals)];
}

function getNextRPNumbers() {
  const sh = SHEETS.LOG();
  const data = sh.getDataRange().getValues();
  const counts = { CM: 0, PM: 0, OH: 0 };
  for (let i = 1; i < data.length; i++) {
    const tipe = String(data[i][1]).trim().toUpperCase();
    if (counts[tipe] !== undefined) counts[tipe]++;
  }
  return {
    CM: counts.CM + 1,
    PM: counts.PM + 1,
    OH: counts.OH + 1
  };
}

// ============================================================
//  STOCK CALCULATOR (realtime dari INOUT)
// ============================================================
function getCurrentStock_(itemId) {
  const sh = SHEETS.INOUT();
  const data = sh.getDataRange().getValues();
  let totalIn = 0, totalOut = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() !== itemId) continue;
    const tipe = String(data[i][1]).trim().toUpperCase();
    const qty  = Number(data[i][4]) || 0;
    if (tipe === 'IN') totalIn += qty;
    else if (tipe === 'OUT') totalOut += qty;
  }
  return totalIn - totalOut;
}

function recalculateStock() {
  // Fungsi untuk rekalk ulang semua stok dari INOUT — jalankan manual jika ada yang kacau
  const inoutSh = SHEETS.INOUT();
  const stockSh = SHEETS.STOCK();
  const data = inoutSh.getDataRange().getValues();

  // Group by Item ID
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const id   = String(data[i][2]).trim();
    const tipe = String(data[i][1]).trim().toUpperCase();
    const qty  = Number(data[i][4]) || 0;
    if (!id) continue;
    if (!map[id]) map[id] = { in: 0, out: 0 };
    if (tipe === 'IN') map[id].in += qty;
    else if (tipe === 'OUT') map[id].out += qty;
  }

  // Update Stock_Report
  const stockData = stockSh.getDataRange().getValues();
  for (let i = 1; i < stockData.length; i++) {
    const id = String(stockData[i][0]).trim();
    if (!id || !map[id]) continue;
    const cur = map[id].in - map[id].out;
    stockSh.getRange(i+1, 5, 1, 3).setValues([[map[id].in, map[id].out, cur]]);
    stockSh.getRange(i+1, 10).setValue(getStockStatus_(cur, Number(stockData[i][8])||0));
  }
  return 'Recalculate selesai: ' + Object.keys(map).length + ' item diproses';
}

function getStockStatus_(stok, min) {
  if (stok <= 0) return '🔴 Habis';
  if (stok < min) return '🟡 Low Stock';
  return '🟢 Safe';
}

// ============================================================
//  SUBMIT REPORT + SPAREPART
// ============================================================
function submitReport(payloadRaw) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Sistem sedang digunakan, coba lagi sebentar');

  try {
    const p = JSON.parse(payloadRaw);
    const now = new Date();
    const logSh  = SHEETS.LOG();
    const inoutSh = SHEETS.INOUT();
    const stockSh = SHEETS.STOCK();

    // Generate Nomor Report
    const counts = getNextRPNumbers();
    const n = counts[p.tipe] || 1;
    const pfxMap = { CM:'MTC-CM-', PM:'MTC-PM-', OH:'MTC-OH-' };
    const noReport = pfxMap[p.tipe] + String(n).padStart(3,'0');

    // Tanggal parse
    const tglDate = p.tanggal ? new Date(p.tanggal + 'T00:00:00') : now;

    // Durasi format
    const durMins = Number(p.durasi) || 0;

    // 1. Tulis ke LOG_MTC
    logSh.appendRow([
      noReport,
      p.tipe,
      tglDate,
      p.start,
      p.finish,
      durMins,
      p.shift || '',
      p.mesin,
      p.area || '',
      p.keluhan,
      p.issue,
      p.action,
      p.category,
      p.pic
    ]);

    // 2. Proses sparepart (OUT)
    const spList = p.spareparts || [];
    for (const sp of spList) {
      const qty = Number(sp.qty) || 0;
      if (!qty) continue;

      // Tulis ke INOUT
      inoutSh.appendRow([
        now,
        'OUT',
        sp.id,
        sp.nama,
        qty,
        Number(sp.harga) || 0,
        sp.lokasi || '',
        p.pic,
        noReport,
        p.mesin + ' - ' + p.keluhan
      ]);

      // Update Stock_Report
      updateStockRow_(stockSh, sp.id, 0, qty);
    }

    return { noReport: noReport, spCount: spList.length };

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
//  SUBMIT STOCK OUT
// ============================================================
function submitStockOut(payloadRaw) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Sistem sedang digunakan, coba lagi sebentar');

  try {
    const p = JSON.parse(payloadRaw);
    const now = new Date();
    const inoutSh = SHEETS.INOUT();
    const stockSh = SHEETS.STOCK();
    const tglDate = p.tanggal ? new Date(p.tanggal + 'T00:00:00') : now;

    for (const item of p.items) {
      const qty = Number(item.qty) || 0;
      if (!qty) continue;

      inoutSh.appendRow([
        now,
        'OUT',
        item.id,
        item.nama,
        qty,
        Number(item.harga) || 0,
        item.lokasi || '',
        p.pic,
        p.noReport || '',
        p.keterangan || ''
      ]);

      updateStockRow_(stockSh, item.id, 0, qty);
    }

    return { count: p.items.length };

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
//  SUBMIT STOCK IN
// ============================================================
function submitStockIn(payloadRaw) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Sistem sedang digunakan, coba lagi sebentar');

  try {
    const p = JSON.parse(payloadRaw);
    const now = new Date();
    const inoutSh  = SHEETS.INOUT();
    const masterSh = SHEETS.MASTER();
    const stockSh  = SHEETS.STOCK();
    const tglDate  = p.tanggal ? new Date(p.tanggal + 'T00:00:00') : now;
    const ket = [p.purchaseType, p.vendor].filter(Boolean).join(' · ');

    // --- RESTOCK: barang existing ---
    if (p.jenis === 'existing') {
      for (const item of (p.items || [])) {
        const qty = Number(item.qty) || 0;
        if (!qty) continue;
        inoutSh.appendRow([
          now, 'IN', item.id, item.nama, qty,
          Number(item.harga) || 0, item.lokasi || '',
          '', '', ket
        ]);
        updateStockRow_(stockSh, item.id, qty, 0, Number(item.harga)||0);
      }
      return { msg: (p.items||[]).length + ' barang diproses · Stok bertambah otomatis' };
    }

    // --- BELI BARU: daftarkan ke master ---
    if (p.jenis === 'new') {
      const newId = generateItemId_(masterSh);
      const qty = Number(p.qty) || 0;
      const harga = Number(p.harga) || 0;
      const minQty = Number(p.minQty) || 0;

      // Tulis ke Master_Sparepart
      masterSh.appendRow([
        newId, p.nama, p.kategori || '', 'Pcs',
        p.lokasi || '', harga, minQty, '🟡 Low Stock'
      ]);

      // Tulis ke INOUT
      inoutSh.appendRow([
        now, 'IN', newId, p.nama, qty, harga,
        p.lokasi || '', '', '', ket
      ]);

      // Tulis ke Stock_Report
      stockSh.appendRow([
        newId, p.nama, p.kategori || '', p.lokasi || '',
        qty, 0, qty, harga, minQty, getStockStatus_(qty, minQty)
      ]);

      return { newId: newId, msg: 'Barang baru terdaftar · ID: ' + newId };
    }

    // --- CATAT SAJA: log pembelian langsung pakai ---
    if (p.jenis === 'log') {
      inoutSh.appendRow([
        now, 'LOG', 'NON-STOCK', p.nama,
        Number(p.qty) || 0, Number(p.harga) || 0,
        '-', '', '', ket + (p.vendor ? ' | ' + p.vendor : '')
      ]);
      return { msg: 'Riwayat pembelian dicatat · Stok tidak berubah' };
    }

    return { msg: 'Selesai' };

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
//  HELPER: UPDATE BARIS STOCK_REPORT
// ============================================================
function updateStockRow_(stockSh, itemId, qtyIn, qtyOut, harga) {
  const data = stockSh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== itemId) continue;
    const curIn  = Number(data[i][4]) || 0;
    const curOut = Number(data[i][5]) || 0;
    const newIn  = curIn + (qtyIn  || 0);
    const newOut = curOut + (qtyOut || 0);
    const newStk = newIn - newOut;
    const min    = Number(data[i][8]) || 0;
    const newHrg = harga > 0 ? harga : (Number(data[i][7]) || 0);

    stockSh.getRange(i+1, 5, 1, 6).setValues([[
      newIn, newOut, newStk, newHrg, min,
      getStockStatus_(newStk, min)
    ]]);
    return;
  }
  // Item belum ada di Stock_Report — skip (akan muncul saat Beli Baru)
}

// ============================================================
//  HELPER: GENERATE ITEM ID
// ============================================================
function generateItemId_(masterSh) {
  const data = masterSh.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]).trim();
    if (id.startsWith('MTC-SP-')) {
      const n = parseInt(id.replace('MTC-SP-',''));
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return 'MTC-SP-' + String(max + 1).padStart(3,'0');
}

// ============================================================
//  MENU TAMBAHAN DI SPREADSHEET
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔧 MTC Tools')
    .addItem('Recalculate Semua Stok', 'recalculateStock')
    .addItem('Buka Web App', 'openWebApp_')
    .addToUi();
}

function openWebApp_() {
  const url = ScriptApp.getService().getUrl();
  const html = HtmlService.createHtmlOutput(
    '<script>window.open("' + url + '");google.script.host.close()</script>'
  );
  SpreadsheetApp.getUi().showModalDialog(html, 'Membuka...');
}
