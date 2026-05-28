import { parse } from 'csv-parse/sync';

/** Baris normal setelah parsing CSV master web (export Sheets: id,nama,kategori,uom,lokasi,harga,minQty). */
export type SparepartWebMasterRow = {
  id: string;
  nama: string;
  kategoriNama: string | null;
  uom: string;
  lokasi: string | null;
  harga: number;
  minQty: number;
  maxLeadTime: number;
  avgLeadTime: number;
};

/**
 * Mengubah teks harga seperti `Rp1,204,350`, `Rp0`, `"Rp11,674"` menjadi angka (IDR tanpa desimal di file ini).
 */
export function parseIdrRpToNumber(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const trimmed = String(raw).replace(/^["']+|["']+$/g, '').trim();
  if (!trimmed) return 0;
  const noRp = trimmed.replace(/Rp/gi, '').replace(/\s/g, '');
  const digitsOnly = noRp.replace(/,/g, '');
  const n = Number(digitsOnly);
  return Number.isFinite(n) ? n : 0;
}

function cell(row: Record<string, string>, ...candidates: string[]): string | undefined {
  for (const key of candidates) {
    if (key in row && row[key] != null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  const lowerMap = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const key of candidates) {
    const actual = lowerMap.get(key.toLowerCase());
    if (actual != null && String(row[actual]).trim() !== '') {
      return row[actual];
    }
  }
  return undefined;
}

export function isWebSparepartMasterShape(sample: Record<string, string> | undefined): boolean {
  if (!sample || Object.keys(sample).length === 0) return false;
  const id = cell(
    sample,
    'id',
    'ID',
    'Item ID',
    'item id',
    'itemid',
    'item_id',
    'kode',
    'Kode Barang',
    'kode barang'
  )?.trim();
  return Boolean(id);
}

function parseLeadTimeInt(raw: string | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = Math.floor(Number(String(raw).replace(/,/g, '').replace(/\s/g, '')) || 0);
  return n < 0 ? 0 : n;
}

function parseLeadTimeFloat(raw: string | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = parseFloat(String(raw).replace(/,/g, '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** ID valid untuk impor paste — menolak pecahan baris seperti "02" atau "chanical". */
export function isRecognizedSparepartId(id: string): boolean {
  const t = id.trim();
  if (/^MTC-SP-\d+$/i.test(t)) return true;
  if (t.length >= 6 && /[A-Za-z]/.test(t) && /[-_]/.test(t)) return true;
  return false;
}

export function recordToWebMasterRow(row: Record<string, string>): SparepartWebMasterRow | null {
  const id = cell(
    row,
    'id',
    'ID',
    'Item ID',
    'item id',
    'itemid',
    'item_id',
    'kode',
    'Kode Barang',
    'kode barang'
  )?.trim();
  if (!id || !isRecognizedSparepartId(id)) return null;

  const namaRaw = cell(
    row,
    'nama',
    'Nama',
    'name',
    'Name',
    'Name Item',
    'nama barang',
    'Nama Barang',
    'deskripsi',
    'Deskripsi'
  )?.trim();
  const nama = namaRaw || id;

  const kategoriNama =
    cell(row, 'kategori', 'Kategori', 'Item Category', 'category', 'item category')?.trim() ??
    null;
  const uom = cell(row, 'uom', 'UoM', 'UOM', 'satuan', 'Satuan')?.trim() || 'Pcs';
  const lokasi = cell(row, 'lokasi', 'Lokasi', 'SLOC', 'sloc', 'lokasi/sloc')?.trim() ?? null;
  const harga = parseIdrRpToNumber(cell(row, 'harga', 'Harga', 'price', 'Harga Satuan'));
  const minRaw = cell(row, 'minQty', 'min_qty', 'Min Qty', 'Min qty', 'min qty', 'minimum qty') ?? '0';
  const minQty = Math.max(0, Math.floor(Number(String(minRaw).replace(/,/g, '')) || 0));
  const maxLeadTime = parseLeadTimeInt(
    cell(
      row,
      'maxleadtime',
      'max_lead_time',
      'Max Lead Time',
      'lead time terlama',
      'Lead Time Terlama'
    )
  );
  const avgLeadTime = parseLeadTimeFloat(
    cell(
      row,
      'avgleadtime',
      'avg_lead_time',
      'Avg Lead Time',
      'lead time rata-rata',
      'Lead Time Rata-Rata'
    )
  );

  return { id, nama, kategoriNama, uom, lokasi, harga, minQty, maxLeadTime, avgLeadTime };
}

export function parseSparepartWebMasterCsv(content: string): SparepartWebMasterRow[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  const out: SparepartWebMasterRow[] = [];
  for (const row of records) {
    const normalized = recordToWebMasterRow(row);
    if (normalized) out.push(normalized);
  }
  return out;
}
