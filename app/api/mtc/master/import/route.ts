import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parseTabularPaste, parseMesinPaste, parseSparepartPaste } from '@/lib/import/parseTabularPaste';
import { importMesinBatch } from '@/lib/import/mesinImport';
import { importSparepartBatch } from '@/lib/sparepart/importSparepartBatch';

function cleanNumber(val: unknown): number {
  if (val === undefined || val === null || val === '') return 0;
  let str = val.toString().replace(/Rp/gi, '').replace(/\s/g, '');

  if (str.includes('.') && (str.match(/\./g) || []).length > 0) {
    if ((str.match(/\./g) || []).length > 1 || str.length - str.lastIndexOf('.') === 4) {
      str = str.replace(/\./g, '');
    }
  }

  str = str.replace(/,/g, '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function cell(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
  }
  const map = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = map.get(key.toLowerCase());
    if (actual && String(row[actual]).trim() !== '') return String(row[actual]).trim();
  }
  return undefined;
}

function resolveRows(body: { data?: unknown; rawText?: unknown }): Record<string, string>[] {
  if (typeof body.rawText === 'string' && body.rawText.trim()) {
    return parseTabularPaste(body.rawText);
  }
  if (Array.isArray(body.data)) {
    return body.data as Record<string, string>[];
  }
  return [];
}

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const body = await req.json();
    const { type } = body;
    const rows = resolveRows(body);

    if (rows.length === 0) {
      return err('Data kosong atau format salah. Paste ulang dari Excel (termasuk baris header).');
    }

    if (type === 'sparepart') {
      const parsed =
        typeof body.rawText === 'string' && body.rawText.trim()
          ? parseSparepartPaste(body.rawText)
          : { records: rows, physicalLines: rows.length, mergedLines: rows.length };

      const report = await importSparepartBatch(prisma, parsed.records, {
        physicalLines: parsed.physicalLines,
        mergedLines: parsed.mergedLines,
      });
      return ok(report);
    }

    if (type === 'mesin') {
      const parsed =
        typeof body.rawText === 'string' && body.rawText.trim()
          ? parseMesinPaste(body.rawText)
          : { records: rows, physicalLines: rows.length, mergedLines: rows.length };

      const report = await importMesinBatch(prisma, parsed.records, {
        physicalLines: parsed.physicalLines,
        mergedLines: parsed.mergedLines,
      });
      return ok(report);
    }

    let successCount = 0;
    let skippedCount = 0;
    let failCount = 0;
    const skippedSamples: { line: number; reason: string }[] = [];
    const failedSamples: { line: number; reason: string }[] = [];

    if (type === 'bom') {
      for (let i = 0; i < rows.length; i++) {
        const line = i + 2;
        const row = rows[i];
        // Support both the CSV format "Nama Mesin,Item ID" and the old "sparepartId,mesinNama" format
        const sparepartId = cell(row, 'Item ID', 'item id', 'sparepartid', 'sparepart_id', 'id');
        const mesinNama = cell(row, 'Nama Mesin', 'nama mesin', 'mesinnama', 'mesin_nama', 'mesin', 'nama');
        if (!sparepartId || !mesinNama) {
          skippedCount++;
          continue;
        }
        try {
          const mesin = await prisma.mesin.upsert({
            where: { nama: mesinNama },
            update: {},
            create: {
              nama: mesinNama,
              tipe: 'keduanya',
              aktif: true,
            },
          });
          // Check sparepart exists
          const sp = await prisma.sparepart.findUnique({ where: { id: sparepartId } });
          if (!sp) {
            skippedCount++;
            if (skippedSamples.length < 10) {
              skippedSamples.push({ line, reason: `Sparepart "${sparepartId}" tidak ada di database` });
            }
            continue;
          }
          await prisma.sparepart.update({
            where: { id: sparepartId },
            data: { mesins: { connect: { id: mesin.id } } },
          });
          successCount++;
        } catch (e: unknown) {
          failCount++;
          if (failedSamples.length < 10) {
            failedSamples.push({
              line,
              reason: e instanceof Error ? e.message : 'Gagal hubungkan BOM',
            });
          }
        }
      }
    } else {
      return err('Tipe import tidak didukung');
    }

    let message =
      `Import selesai (${rows.length} baris):\n` +
      `✅ Berhasil: ${successCount}\n` +
      `⏭️ Dilewati: ${skippedCount}\n` +
      `❌ Gagal: ${failCount}`;
    if (skippedSamples.length) {
      message += '\n\nDilewati: ' + skippedSamples.map((s) => `baris ${s.line} — ${s.reason}`).join('; ');
    }
    if (failedSamples.length) {
      message += '\n\nGagal: ' + failedSamples.map((s) => `baris ${s.line} — ${s.reason}`).join('; ');
    }

    return ok({
      message,
      totalRows: rows.length,
      success: successCount,
      skipped: skippedCount,
      failed: failCount,
      skippedRows: skippedSamples,
      failedRows: failedSamples,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err('Terjadi kesalahan saat import data: ' + message, 500);
  }
}
