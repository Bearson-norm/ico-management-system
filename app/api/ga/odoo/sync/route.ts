import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// Helper untuk query Odoo via JSON-RPC dengan Cookie session_id
async function queryOdoo(
  model: string,
  method: string,
  args: any[],
  kwargs: any = {},
  sessionId: string
) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model,
      method,
      args,
      kwargs
    },
    id: Math.floor(Math.random() * 10000)
  };

  const res = await fetch('https://foomx.odoo.com/web/dataset/call_kw', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${sessionId}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000) // 15 seconds timeout
  });

  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }

  return json.result;
}

const GENERIC_NAMES = ['EQUIPMENT', 'SPAREPARTS USAGE', 'SUPPLIES', 'FACTORY SUPPLIES', 'Barang GA', 'Produk Tanpa Nama'];
const ACCOUNT_NAME_PATTERNS = [
  /^SUPPLIES\s+FACTORY\s+RELATED$/i,
  /^OFFICE\s+SUPPLIES$/i,
  /^FACTORY\s+SUPPLIES$/i,
  /^GENERAL\s+SUPPLIES$/i,
  /^MAINTENANCE\s+SUPPLIES$/i,
  /^CLEANING\s+SUPPLIES$/i,
  /^CONSUMABLE/i,
  /^Barang\s+GA$/i,
];

function isGenericName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (GENERIC_NAMES.some(g => trimmed.toLowerCase() === g.toLowerCase())) {
    return true;
  }
  for (const pattern of ACCOUNT_NAME_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function getBestOdooLineName(line: any): string {
  const desc = (line.product_description_variants || line.name || '')?.trim();
  const productLabel = (Array.isArray(line.product_id) ? line.product_id[1] : '')?.trim();
  
  if (desc && !isGenericName(desc)) {
    return desc;
  }
  if (productLabel && !isGenericName(productLabel)) {
    return productLabel;
  }
  return desc || productLabel || 'Produk Tanpa Nama';
}

// Intelligent best match line item helper using name, substring, digits, and quantity scoring
function findBestMatchedLine(lines: any[], item: any): any {
  if (!lines || lines.length === 0) return null;

  const odooItemName = item.item?.nama?.toLowerCase()?.trim() || '';
  const originalName = item.originalName?.toLowerCase()?.trim() || '';
  const targetQty = Number(item.qty) || 0;

  // Extract all digits from originalName for sequence/specs matching (e.g. "isi 2" -> ["2"])
  const originalDigits = originalName.match(/\b\d+\b/g) || [];

  let bestLine = null;
  let bestScore = -1;

  for (const line of lines) {
    const prodName = Array.isArray(line.product_id) ? line.product_id[1]?.toLowerCase()?.trim() : '';
    const lineName = line.name?.toLowerCase()?.trim() || '';
    const lineQty = Number(line.product_qty) || 0;

    let score = 0;

    // 1. Exact Match (highest priority)
    if (originalName && (originalName === prodName || originalName === lineName)) {
      score += 100;
    }
    if (odooItemName && (odooItemName === prodName || odooItemName === lineName)) {
      score += 80;
    }

    // 2. Substring Match
    if (prodName && prodName.length > 3) {
      if (originalName.includes(prodName) || prodName.includes(originalName)) {
        score += 20;
      }
      if (odooItemName && (odooItemName.includes(prodName) || prodName.includes(odooItemName))) {
        score += 15;
      }
    }

    if (lineName && lineName.length > 3) {
      if (originalName.includes(lineName) || lineName.includes(originalName)) {
        score += 20;
      }
    }

    // 3. Digits Specifications Matching
    const lineDigits = lineName.match(/\b\d+\b/g) || [];
    let digitMatchCount = 0;
    for (const d of originalDigits) {
      if (lineDigits.includes(d)) digitMatchCount++;
    }
    score += digitMatchCount * 10;

    // 4. Quantity matching as tie-breaker
    if (targetQty > 0 && Math.round(targetQty) === Math.round(lineQty)) {
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestScore >= 10 ? bestLine : null;
}

// POST /api/ga/odoo/sync
export async function POST(req: NextRequest) {
  // Check CRON_TOKEN bypass
  const authHeader = req.headers.get('Authorization');
  const queryToken = req.nextUrl.searchParams.get('token');
  const reqToken = (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null) || queryToken;
  
  let isAuthorized = false;
  if (reqToken && process.env.CRON_TOKEN && reqToken === process.env.CRON_TOKEN) {
    isAuthorized = true;
  } else {
    const session = await requireGaEditor();
    if (session) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return err('Akses ditolak', 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Graceful if empty
  }

  // Fetch settings from database as fallback
  let dbSettings: Record<string, string> = {};
  try {
    const settingsList = await prismaGa.gaSetting.findMany();
    dbSettings = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);
  } catch (dbErr) {
    console.error('Failed to load GA settings from database:', dbErr);
  }

  const odooSessionId = body.odooSessionId || dbSettings['ga_odoo_session_id'] || process.env.ODOO_SESSION_ID || '';
  const odooUid = body.odooUid || (dbSettings['ga_odoo_uid'] ? parseInt(dbSettings['ga_odoo_uid']) : null) || process.env.ODOO_UID || 34;

  if (!odooSessionId) {
    return err('Cookie session_id Odoo diperlukan untuk melakukan sinkronisasi.', 400);
  }


  const parsedUid = Number(odooUid) || 34;

  try {
    const checkDaysAgo = new Date();
    checkDaysAgo.setDate(checkDaysAgo.getDate() - 180);

    const activeTrackingItems = await prismaGa.gaProcurementTracking.findMany({
      where: {
        OR: [
          { status: 'ORDERED' },
          { tanggalPesan: { gte: checkDaysAgo } },
          { createdAt: { gte: checkDaysAgo } }
        ]
      },
      include: { item: true }
    });

    // Grouping by docName (prefer nomorPr for Odoo-origin items to handle split POs correctly)
    const grouped: { [docName: string]: typeof activeTrackingItems } = {};
    for (const item of activeTrackingItems) {
      const prNo = item.nomorPr?.trim();
      const poNo = item.nomorPo?.trim();
      const docName = prNo || poNo;
      if (!docName) continue;
      if (!grouped[docName]) grouped[docName] = [];
      grouped[docName].push(item);
    }

    let vendorUpdatedCount = 0;

    // Fetch Odoo POs and lines in parallel (massively speeds up sync!)
    const fetchPromises = Object.keys(grouped).map(async (docName) => {
      const items = grouped[docName];
      try {
        const odooPos = await queryOdoo(
          'purchase.order',
          'search_read',
          [[
            '|', '|',
            ['name', '=', docName],
            ['origin', '=', docName],
            ['partner_ref', '=', docName]
          ]],
          {
            fields: ['id', 'name', 'state', 'partner_id'],
            limit: 50
          },
          odooSessionId
        );

        if (odooPos && odooPos.length > 0) {
          const allPoLines: any[] = [];
          const poGrStatusMap = new Map<number, { isGrDone: boolean, odooGrDate: Date | null, odooGrLink: string | null }>();

          for (const odooPo of odooPos) {
            const poId = odooPo.id;
            const poName = odooPo.name;
            const vendorName = Array.isArray(odooPo.partner_id) ? odooPo.partner_id[1] : null;

            const [poLines, odooGrs] = await Promise.all([
              queryOdoo(
                'purchase.order.line',
                'search_read',
                [[['order_id', '=', poId]]],
                {
                  fields: ['name', 'price_unit', 'product_qty', 'qty_received', 'product_id'],
                  limit: 50
                },
                odooSessionId
              ).catch(() => []),
              queryOdoo(
                'good.received',
                'search_read',
                [[['purchase_id', '=', poId]]],
                {
                  fields: ['id', 'state', 'write_date', 'name'],
                  limit: 1
                },
                odooSessionId
              ).catch(() => [])
            ]);

            for (const line of poLines) {
              line.parentPoName = poName;
              line.parentPoId = poId;
              line.parentVendorName = vendorName;
            }
            allPoLines.push(...poLines);

            let odooGrDate: Date | null = null;
            let isGrDone = false;
            let odooGrLink: string | null = null;

            if (odooGrs && odooGrs.length > 0) {
              const odooGr = odooGrs[0];
              odooGrLink = `https://foomx.odoo.com/web#id=${odooGr.id}&model=good.received&view_type=form`;
              if (odooGr.state === 'done') {
                isGrDone = true;
                if (odooGr.write_date) {
                  const parsedGrDate = new Date(odooGr.write_date);
                  if (!isNaN(parsedGrDate.getTime())) {
                    odooGrDate = parsedGrDate;
                  }
                }
              }
            }
            poGrStatusMap.set(poId, { isGrDone, odooGrDate, odooGrLink });
          }
          return { docName, items, odooPos, allPoLines, poGrStatusMap, error: null };
        }
        return { docName, items, odooPos: [], allPoLines: [], poGrStatusMap: new Map(), error: null };
      } catch (err) {
        return { docName, items, odooPos: [], allPoLines: [], poGrStatusMap: new Map(), error: err };
      }
    });

    const odooResults = await Promise.all(fetchPromises);

    // Helper to create Stock Movement for GA to ensure inventory matches Odoo sync
    const createGaStockMovement = async (tx: any, tracking: any, qty: number, harga: number, vendor: string | null, date: Date) => {
      if (tracking.isStocked && tracking.itemId) {
        const item = await tx.gaItem.findUnique({
          where: { id: tracking.itemId },
        });

        if (item) {
          await tx.gaStockMovement.create({
            data: {
              tipe: 'IN',
              itemId: item.id,
              namaBarang: item.nama,
              qty: qty,
              qtyDiterima: qty,
              tanggalTerima: date,
              tanggal: date,
              harga: harga,
              vendor: vendor,
              purchaseType: 'PO',
              keterangan: `[Sync Odoo - Penerimaan Pesanan GA]${tracking.nomorPo ? ` PO: ${tracking.nomorPo}` : ''}${tracking.keterangan ? ` - ${tracking.keterangan}` : ''}`,
            },
          });

          await tx.gaItem.update({
            where: { id: item.id },
            data: { harga: harga },
          });
        }
      } else {
        await tx.gaStockMovement.create({
          data: {
            tipe: 'OUT',
            itemId: tracking.itemId || null,
            namaBarang: tracking.originalName,
            qty: qty,
            qtyDiterima: qty,
            tanggalTerima: date,
            tanggal: date,
            harga: harga,
            vendor: vendor,
            purchaseType: 'PO',
            keterangan: `[Sync Odoo - Penerimaan Langsung]${tracking.nomorPo ? ` PO: ${tracking.nomorPo}` : ''} Alasan: ${tracking.keterangan || 'Kebutuhan langsung'}`,
          },
        });

        if (tracking.itemId) {
          await tx.gaItem.update({
            where: { id: tracking.itemId },
            data: { harga: harga },
          });
        }
      }
    };

    // Process database updates sequentially to prevent locks
    for (const result of odooResults) {
      const { docName, items, odooPos, allPoLines, poGrStatusMap, error } = result as any;
      if (error) {
        console.error(`Gagal mengambil info vendor dari Odoo untuk ${docName}:`, error);
        if ((error as any)?.message?.toLowerCase()?.includes('session expired')) {
          throw error;
        }
        continue;
      }
      if (odooPos.length === 0) continue;

      await prismaGa.$transaction(async (tx) => {
        for (const item of items) {
          let matchedLine = null;
          if (allPoLines.length > 0) {
            matchedLine = findBestMatchedLine(allPoLines, item);
          }

          const targetPo = matchedLine 
            ? odooPos.find((p: any) => p.id === matchedLine.parentPoId)
            : odooPos[0];
          const poId = targetPo.id;
          const poName = targetPo.name;
          const vendorName = Array.isArray(targetPo.partner_id) ? targetPo.partner_id[1] : null;

          const grStatus = poGrStatusMap.get(poId) || { isGrDone: false, odooGrDate: null, odooGrLink: null };
          const { isGrDone, odooGrDate } = grStatus;

          let matchedPrice = matchedLine ? Number(matchedLine.price_unit) || 0 : 0;
          let matchedQty = matchedLine ? Number(matchedLine.product_qty) || 0 : 0;
          let qtyReceived = matchedLine ? Number(matchedLine.qty_received) || 0 : 0;

          const updateData: any = {
            nomorPo: poName,
          };
          if (matchedLine && isGenericName(item.originalName)) {
            const specificName = getBestOdooLineName(matchedLine);
            if (!isGenericName(specificName)) {
              updateData.originalName = specificName;
            }
          }
          if (vendorName) updateData.vendor = vendorName;
          if (matchedPrice > 0) updateData.harga = matchedPrice;

          const siblingItems = await tx.gaProcurementTracking.findMany({
            where: {
              nomorPo: poName,
              originalName: item.originalName,
              nomorPr: item.nomorPr
            }
          });

          const alreadyReceivedQty = siblingItems
            .filter((sib: any) => sib.status === 'RECEIVED' && sib.id !== item.id)
            .reduce((sum: number, sib: any) => sum + sib.qty, 0);

          const newReceiptQty = qtyReceived - alreadyReceivedQty;
          const isPartialOdooGr = !!(matchedLine && qtyReceived > 0 && qtyReceived < matchedQty);

          if (matchedQty > 0 && item.qty === Math.round(matchedQty)) {
            updateData.qty = Math.round(matchedQty);
          }

          const tDate = odooGrDate || new Date();

          if (newReceiptQty > 0 && newReceiptQty < item.qty) {
            // SPLIT GR HANDLING: Baru diterima sebagian dari porsi pending saat ini
            updateData.qty = newReceiptQty;
            updateData.status = 'RECEIVED';
            updateData.grDone = true;
            updateData.tanggalTerima = tDate;

            const remainingQty = item.qty - newReceiptQty;
            await tx.gaProcurementTracking.create({
              data: {
                originalName: item.originalName,
                itemId: item.itemId,
                qty: remainingQty,
                harga: matchedPrice > 0 ? matchedPrice : item.harga,
                vendor: vendorName || item.vendor,
                nomorPr: item.nomorPr,
                nomorPo: poName,
                status: 'ORDERED',
                tanggalPesan: item.tanggalPesan,
                isStocked: item.isStocked,
                grDone: false,
                keterangan: item.keterangan,
              }
            });

            // Create stock movement for the received portion
            await createGaStockMovement(tx, item, newReceiptQty, matchedPrice > 0 ? matchedPrice : Number(item.harga || 0), vendorName || item.vendor, tDate);
            vendorUpdatedCount++;
          } else if (newReceiptQty >= item.qty || (isGrDone && !isPartialOdooGr)) {
            // Porsi pending saat ini sudah terisi penuh atau PO secara keseluruhan selesai
            updateData.status = 'RECEIVED';
            updateData.grDone = true;
            updateData.tanggalTerima = item.tanggalTerima || tDate;

            // Create stock movement only if the status was not already RECEIVED
            if (item.status !== 'RECEIVED') {
              await createGaStockMovement(tx, item, updateData.qty || item.qty, matchedPrice > 0 ? matchedPrice : Number(item.harga || 0), vendorName || item.vendor, updateData.tanggalTerima);
            }
            vendorUpdatedCount++;
          } else {
            // If none match, revert to ORDERED / not RECEIVED
            updateData.status = 'ORDERED';
            updateData.grDone = false;
            updateData.tanggalTerima = null;
          }

          await tx.gaProcurementTracking.update({
            where: { id: item.id },
            data: updateData,
          });
        }
      });
    }


    // -----------------------------------------------------------------
    // LANGKAH 1b: CEK GR ODOO UNTUK ITEM YANG SUDAH DITERIMA MANUAL (grDone=false)
    // Barang yang sudah diterima admin secara manual tapi GR di Odoo belum terkonfirmasi
    // Sinkronisasi ini hanya mengupdate flag grDone tanpa membuat stok movement duplikat
    // -----------------------------------------------------------------
    const pendingGrItems = await prismaGa.gaProcurementTracking.findMany({
      where: { status: 'RECEIVED', grDone: false },
    });

    let grConfirmedCount = 0;

    if (pendingGrItems.length > 0) {
      // Kelompokkan berdasarkan nomor dokumen
      const grGrouped: { [docName: string]: typeof pendingGrItems } = {};
      for (const item of pendingGrItems) {
        const doc = item.nomorPo || item.nomorPr;
        if (!doc) continue;
        if (!grGrouped[doc]) grGrouped[doc] = [];
        grGrouped[doc].push(item);
      }

      for (const docName of Object.keys(grGrouped)) {
        const items = grGrouped[docName];
        try {
          // Cari PO di Odoo
          const odooPos = await queryOdoo(
            'purchase.order',
            'search_read',
            [[
              '|', '|',
              ['name', '=', docName],
              ['origin', '=', docName],
              ['partner_ref', '=', docName]
            ]],
            { fields: ['id', 'name', 'state'], limit: 1 },
            odooSessionId
          );

          if (odooPos && odooPos.length > 0) {
            const poId = odooPos[0].id;

            // Cek GR di Odoo
            const odooGrs = await queryOdoo(
              'good.received',
              'search_read',
              [[['purchase_id', '=', poId]]],
              { fields: ['id', 'state'], limit: 1 },
              odooSessionId
            );

            const grDoneInOdoo = odooGrs && odooGrs.length > 0 && odooGrs[0].state === 'done';

            if (grDoneInOdoo) {
              // Update grDone menjadi true — stok sudah masuk dari penerimaan manual, tidak perlu buat duplikat
              await prismaGa.gaProcurementTracking.updateMany({
                where: { id: { in: items.map((i) => i.id) } },
                data: { grDone: true },
              });
              grConfirmedCount += items.length;
            }
          }
        } catch (errGr: any) {
          console.error(`Gagal cek GR Odoo untuk dokumen ${docName}:`, errGr);
          if (errGr?.message?.toLowerCase()?.includes('session expired')) {
            throw errGr;
          }
        }
      }
    }

    // -----------------------------------------------------------------
    // LANGKAH 2: IMPOR PR BARU DARI ODOO BERDASARKAN KATA KUNCI GA
    // -----------------------------------------------------------------
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 365); // Menggunakan 365 hari (1 tahun) agar mencakup semua data PR histori
    const fortyFiveDaysAgoStr = fortyFiveDaysAgo.toISOString().replace('T', ' ').substring(0, 19);

    // Ambil daftar nomor PR yang sudah ada di database lokal untuk mencegah double-import tanpa membebani query loop
    const existingPRs = await prismaGa.gaProcurementTracking.findMany({
      select: { nomorPr: true }
    });
    const existingSet = new Set(existingPRs.map(e => e.nomorPr?.trim()).filter(Boolean));

    let importedPrCount = 0;

    // Impor dari purchase.requisition (PR Requisition Odoo)
    try {
      const requisitions = await queryOdoo(
        'purchase.requisition',
        'search_read',
        [[
          ['create_date', '>=', fortyFiveDaysAgoStr],
          '|', '|',
          ['description', 'ilike', 'ga'],
          ['description', 'ilike', 'general affairs'],
          ['description', 'ilike', 'cikupa']
        ]],
        { fields: ['id', 'name', 'create_date', 'description'] },
        odooSessionId
      );

      if (requisitions && requisitions.length > 0) {
        for (const req of requisitions) {
          const prName = req.name?.trim();
          if (!prName) continue;

          // Periksa apakah PR ini sudah diimpor secara lokal
          const exists = existingSet.has(prName);

          if (!exists) {
            // Tarik line items dari PR tersebut
            const lines = await queryOdoo(
              'purchase.requisition.line',
              'search_read',
              [[['requisition_id', '=', req.id]]],
              { fields: ['product_id', 'product_qty', 'price_unit', 'product_description_variants', 'name'], limit: 50 },
              odooSessionId
            );

            if (lines && lines.length > 0) {
              const prDate = req.create_date ? new Date(req.create_date) : new Date();

              await prismaGa.$transaction(async (tx) => {
                for (const line of lines) {
                  const prodName = getBestOdooLineName(line);
                  // Skip if name is still generic (meaning there is no real item description)
                  if (!prodName || isGenericName(prodName)) continue;

                  const qty = Number(line.product_qty) || 1;
                  const price = Number(line.price_unit) || 0;

                  // Coba cocokkan ke master barang GA
                  let itemId: string | null = null;
                  let matchedItem = await tx.gaItem.findFirst({
                    where: { nama: { equals: prodName, mode: 'insensitive' } },
                  });
                  if (!matchedItem) {
                    const allItems = await tx.gaItem.findMany({ where: { aktif: true } });
                    const cleanProd = prodName.toLowerCase().trim();
                    matchedItem = allItems.find(item => {
                      const cleanName = item.nama.toLowerCase().trim();
                      return cleanProd.includes(cleanName) || cleanName.includes(cleanProd);
                    }) || null;
                  }
                  if (matchedItem) {
                    itemId = matchedItem.id;
                  }
                  // Tidak auto-create master item — biarkan admin hubungkan secara manual

                  await tx.gaProcurementTracking.create({
                    data: {
                      originalName: prodName.trim(),
                      itemId,
                      qty,
                      harga: price,
                      nomorPr: prName,
                      status: 'ORDERED',
                      tanggalPesan: prDate,
                      isStocked: true,
                      keterangan: req.description || line.name || null,
                    },
                  });
                }
              });
              importedPrCount++;
            }
          }
        }
      }
    } catch (errReq: any) {
      console.error('Gagal mengimpor Requisitions dari Odoo:', errReq);
      if (errReq?.message?.toLowerCase()?.includes('session expired')) {
        throw errReq;
      }
    }

    // Impor dari purchase.request (PR Request Odoo)
    try {
      const requests = await queryOdoo(
        'purchase.request',
        'search_read',
        [[
          ['create_date', '>=', fortyFiveDaysAgoStr],
          '|', '|',
          ['description', 'ilike', 'ga'],
          ['description', 'ilike', 'general affairs'],
          ['description', 'ilike', 'cikupa']
        ]],
        { fields: ['id', 'name', 'create_date', 'description'] },
        odooSessionId
      );

      if (requests && requests.length > 0) {
        for (const req of requests) {
          const prName = req.name?.trim();
          if (!prName) continue;

          const exists = existingSet.has(prName);

          if (!exists) {
            const lines = await queryOdoo(
              'purchase.request.line',
              'search_read',
              [[['request_id', '=', req.id]]],
              { fields: ['product_id', 'product_qty', 'estimated_cost', 'name'], limit: 50 },
              odooSessionId
            );

            if (lines && lines.length > 0) {
              const prDate = req.create_date ? new Date(req.create_date) : new Date();

              await prismaGa.$transaction(async (tx) => {
                for (const line of lines) {
                  const prodName = getBestOdooLineName(line);
                  // Skip if name is still generic (meaning there is no real item description)
                  if (!prodName || isGenericName(prodName)) continue;

                  const qty = Number(line.product_qty) || 1;
                  const price = Number(line.estimated_cost) || 0;

                  let itemId: string | null = null;
                  let matchedItem = await tx.gaItem.findFirst({
                    where: { nama: { equals: prodName, mode: 'insensitive' } },
                  });
                  if (!matchedItem) {
                    const allItems = await tx.gaItem.findMany({ where: { aktif: true } });
                    const cleanProd = prodName.toLowerCase().trim();
                    matchedItem = allItems.find(item => {
                      const cleanName = item.nama.toLowerCase().trim();
                      return cleanProd.includes(cleanName) || cleanName.includes(cleanProd);
                    }) || null;
                  }
                  if (matchedItem) {
                    itemId = matchedItem.id;
                  }
                  // Tidak auto-create master item — biarkan admin hubungkan secara manual

                  await tx.gaProcurementTracking.create({
                    data: {
                      originalName: prodName.trim(),
                      itemId,
                      qty,
                      harga: price,
                      nomorPr: prName,
                      status: 'ORDERED',
                      tanggalPesan: prDate,
                      isStocked: true,
                      keterangan: req.description || line.name || null,
                    },
                  });
                }
              });
              importedPrCount++;
            }
          }
        }
      }
    } catch (errReq: any) {
      console.error('Gagal mengimpor Requests dari Odoo:', errReq);
      if (errReq?.message?.toLowerCase()?.includes('session expired')) {
        throw errReq;
      }
    }

    return ok({
      msg: 'Sinkronisasi Odoo selesai!',
      data: {
        vendorUpdatedCount,
        grConfirmedCount,
        importedPrCount,
      },
    });
  } catch (e: any) {
    console.error('[POST /api/ga/odoo/sync]', e);
    return err(`Gagal sinkronisasi Odoo: ${e.message}`, 500);
  }
}
