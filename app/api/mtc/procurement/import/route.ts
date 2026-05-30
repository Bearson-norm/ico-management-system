import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parse } from 'csv-parse/sync';

function parseDateString(raw: string | undefined | null): Date | null {
  if (!raw || !raw.trim() || raw.trim() === '-' || raw.trim() === '#N/A') return null;
  const cleaned = raw.trim();
  
  // Cocokkan format DD/MM/YY atau DD/MM/YYYY
  const match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    let year = parseInt(match[3]);
    if (year < 100) {
      year += 2000;
    }
    const d = new Date(year, month, day, 12, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }
  
  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseCleanPrice(raw: string | undefined | null): number {
  if (!raw || !raw.trim() || raw.trim() === '-' || raw.trim() === '#N/A') return 0;
  // Hapus semua karakter kecuali angka, titik, dan minus
  const cleaned = raw.replace(/[^\d.-]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// POST /api/mtc/procurement/import
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const { csvText, sheetUrl } = body;
  let finalCsvText = '';

  if (sheetUrl && sheetUrl.trim()) {
    try {
      let sheetId = sheetUrl.trim();
      const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        sheetId = match[1];
      }
      const fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(fetchUrl);
      if (!res.ok) {
        return err('Gagal mengunduh Google Sheet. Pastikan link dapat diakses publik atau di-share di organisasi Anda.', 400);
      }
      finalCsvText = await res.text();
    } catch (e: any) {
      return err(`Error koneksi ke Google Sheet: ${e.message}`, 500);
    }
  } else if (csvText && csvText.trim()) {
    finalCsvText = csvText;
  } else {
    return err('CSV Text atau Google Sheet URL wajib diisi', 400);
  }

  try {
    // Parse CSV sebagai array mentah (tidak menggunakan columns: true agar index konsisten)
    const records = parse(finalCsvText, {
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    }) as string[][];

    if (records.length < 2) {
      return err('CSV kosong atau tidak memiliki baris data', 400);
    }

    // Lewati baris header pertama
    const dataRows = records.slice(1);
    let importedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of dataRows) {
        // Baris kosong atau kurang dari 8 kolom dilewati
        if (row.length < 8 || !row[1]?.trim()) continue;

        const fbIndex = parseInt(row[0]) || null;
        const originalName = row[1].trim();
        const odooItemName = row[2]?.trim() || '';
        const keterangan = row[3]?.trim() || null;
        const penggunaanBulan = parseInt(row[4]) || null;
        const kontrak3Bulan = row[5]?.toLowerCase() === 'true' || row[5] === '1';
        const tanggalList = parseDateString(row[6]) || new Date();
        const qty = parseInt(row[7]) || 1;
        const productCategory = row[8]?.trim() || null;
        const reason = row[9]?.trim() || null;
        const urgency = row[10]?.trim() || 'Normal';
        const linkReferences = row[11]?.trim() || null;
        const vendor = row[12]?.trim() || null;
        const harga = parseCleanPrice(row[13]);
        const nomorPr = row[14]?.trim() || null;
        const statusPr = row[15]?.trim() || 'DRAFT';
        const statusPa = row[16]?.trim() || null;
        const statusPo = row[18]?.trim() || null; // Status PO di index 18
        const nomorPo = row[19]?.trim() || null;  // No PO di index 19
        const etaFoom = parseDateString(row[21]); // ETA di index 21
        const linkGr = row[22]?.trim() || null;   // Link GR di index 22
        const tanggalTerima = parseDateString(row[24]); // Kapan Terima di index 24

        // Smart Match: cari sparepart resmi berdasarkan nama ODOO
        let sparepartId: string | null = null;
        if (odooItemName) {
          const sp = await tx.sparepart.findFirst({
            where: { nama: { equals: odooItemName, mode: 'insensitive' } },
          });
          if (sp) {
            sparepartId = sp.id;
          }
        }

        // Cari record yang ada berdasarkan fbIndex atau kombinasi (originalName, tanggalList, qty)
        let trackingItem = null;
        if (fbIndex != null) {
          trackingItem = await tx.procurementTracking.findFirst({
            where: { fbIndex },
          });
        } else {
          trackingItem = await tx.procurementTracking.findFirst({
            where: {
              originalName,
              tanggalList,
              qty,
            },
          });
        }

        // Protect local PO number & status from SCM sheet typos and blanks
        let finalNomorPr = nomorPr;
        let finalNomorPo = nomorPo;
        let finalStatusPo = statusPo;
        let finalVendor = vendor;
        let finalHarga = harga;
        let finalEtaFoom = etaFoom;

        if (trackingItem) {
          // If local already has a PO number, and SCM sheet PO number is empty, protect the local PO!
          if (trackingItem.nomorPo && !nomorPo) {
            finalNomorPo = trackingItem.nomorPo;
            finalStatusPo = trackingItem.statusPo; // Keep local status (e.g. active or DONE)
            finalVendor = vendor || trackingItem.vendor;
            finalHarga = harga || (trackingItem.harga ? Number(trackingItem.harga) : 0);
            finalEtaFoom = etaFoom || trackingItem.etaFoom;
          }
          
          // Also protect local PR number if local has it but sheet has empty/null
          if (trackingItem.nomorPr && !nomorPr) {
            finalNomorPr = trackingItem.nomorPr;
          }
        }

        const dataPayload = {
          fbIndex,
          originalName,
          sparepartId,
          keterangan,
          penggunaanBulan,
          kontrak3Bulan,
          tanggalList,
          qty,
          productCategory,
          reason,
          urgency,
          linkReferences,
          vendor: finalVendor,
          harga: finalHarga,
          nomorPr: finalNomorPr,
          statusPr,
          statusPa,
          statusPo: finalStatusPo,
          nomorPo: finalNomorPo,
          etaFoom: finalEtaFoom,
          linkGr,
          tanggalTerima,
        };

        if (trackingItem) {
          // Update data pelacakan jika sudah ada
          await tx.procurementTracking.update({
            where: { id: trackingItem.id },
            data: dataPayload,
          });
        } else {
          // Buat data pelacakan baru jika belum ada
          await tx.procurementTracking.create({
            data: dataPayload,
          });
        }
        importedCount++;
      }
    });

    return ok({ msg: `Berhasil sinkronisasi ${importedCount} baris pengadaan.` });
  } catch (e: any) {
    console.error('[POST /api/mtc/procurement/import]', e);
    return err(`Gagal memproses data CSV: ${e.message}`, 500);
  }
}
