import { NextRequest } from 'next/server';
import PDFDocument from 'pdfkit';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAdmin } from '@/lib/auth';
import { monthBoundsJakarta } from '@/lib/ga/auditSnapshot';

export const runtime = 'nodejs';

function formatJakarta(value: Date) {
  return value.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function cleanText(value: string | null | undefined) {
  return (value || '-').replace(/\s+/g, ' ').trim();
}

export async function GET(req: NextRequest) {
  const session = await requireGaAdmin();
  if (!session) return new Response('Forbidden', { status: 403 });

  const periode = new URL(req.url).searchParams.get('periode') || '';
  if (!periode) return new Response('Parameter periode wajib diisi', { status: 400 });

  const snapshot = await prismaGa.gaAuditSnapshot.findUnique({
    where: { periode },
    include: { lines: { orderBy: { namaItem: 'asc' } } },
  });
  if (!snapshot) return new Response('Snapshot tidak ditemukan', { status: 404 });

  const { monthStart } = monthBoundsJakarta(periode);
  const itemIds = snapshot.lines.filter((l) => l.jumlahTransaksi > 0).map((l) => l.itemId);
  const movements = itemIds.length
    ? await prismaGa.gaStockMovement.findMany({
        where: {
          itemId: { in: itemIds },
          tipe: { in: ['IN', 'OUT', 'ADJ'] },
          tanggal: { gte: monthStart, lt: snapshot.cutoffAt },
        },
        orderBy: [{ itemId: 'asc' }, { tanggal: 'asc' }],
        select: {
          id: true,
          itemId: true,
          tipe: true,
          qty: true,
          tanggal: true,
          createdAt: true,
          picNama: true,
          purchaseType: true,
          vendor: true,
          keterangan: true,
        },
      })
    : [];

  const movementsByItem = new Map<string, typeof movements>();
  for (const movement of movements) {
    if (!movement.itemId) continue;
    const list = movementsByItem.get(movement.itemId) || [];
    list.push(movement);
    movementsByItem.set(movement.itemId, list);
  }

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 28,
    info: {
      Title: `Audit Trail GA ${periode}`,
      Author: session.user.name || 'GA Administrator',
      Subject: 'Snapshot pergerakan stok sistem per periode',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensureSpace = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };

  doc.font('Helvetica-Bold').fontSize(17).fillColor('#111827').text('LAPORAN AUDIT TRAIL GA');
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  doc.text(`Periode: ${snapshot.periode}`);
  doc.text(`Digenerate: ${formatJakarta(snapshot.generatedAt)} WIB`);
  doc.text(`Cutoff: ${formatJakarta(snapshot.cutoffAt)} WIB | Sumber: ${snapshot.source}`);

  const backdateItemIds = new Set(
    movements
      .filter((m) => m.itemId && m.createdAt.getTime() > snapshot.cutoffAt.getTime())
      .map((m) => m.itemId as string)
  );
  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#111827')
    .text(
      `Ringkasan: ${snapshot.lines.length} barang | Barang dengan transaksi backdate: ${backdateItemIds.size}`
    );
  doc.moveDown(0.8);

  const summaryColumns = [
    { label: 'Kode', width: 75, align: 'left' as const },
    { label: 'Nama Barang', width: 200, align: 'left' as const },
    { label: 'Lokasi', width: 85, align: 'left' as const },
    { label: 'Awal', width: 50, align: 'right' as const },
    { label: 'IN', width: 45, align: 'right' as const },
    { label: 'OUT', width: 45, align: 'right' as const },
    { label: 'ADJ', width: 45, align: 'right' as const },
    { label: 'Sistem', width: 55, align: 'right' as const },
    { label: 'Integritas', width: 85, align: 'left' as const },
  ];

  const drawSummaryHeader = () => {
    const y = doc.y;
    doc.rect(doc.page.margins.left, y, pageWidth, 18).fill('#1f2937');
    let x = doc.page.margins.left + 4;
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#ffffff');
    for (const col of summaryColumns) {
      doc.text(col.label, x, y + 5, { width: col.width - 6, align: col.align, lineBreak: false });
      x += col.width;
    }
    doc.y = y + 18;
  };

  drawSummaryHeader();
  snapshot.lines.forEach((line, index) => {
    if (doc.y + 18 > bottom()) {
      doc.addPage();
      drawSummaryHeader();
    }
    const y = doc.y;
    if (index % 2 === 1) doc.rect(doc.page.margins.left, y, pageWidth, 18).fill('#f3f4f6');
    let x = doc.page.margins.left + 4;
    const values = [
      line.itemId,
      line.namaItem,
      line.lokasi || '-',
      String(line.saldoAwal),
      String(line.totalIn),
      String(line.totalOut),
      String(line.totalAdj),
      String(line.stokSistem),
      backdateItemIds.has(line.itemId) ? 'Backdate' : 'Sesuai Closing',
    ];
    doc.font('Helvetica').fontSize(6.5).fillColor('#111827');
    values.forEach((value, colIndex) => {
      const col = summaryColumns[colIndex];
      doc.text(cleanText(value), x, y + 5, {
        width: col.width - 6,
        align: col.align,
        ellipsis: true,
        lineBreak: false,
      });
      x += col.width;
    });
    doc.y = y + 18;
  });

  // Detail transaksi per barang
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('DETAIL TRANSAKSI PER BARANG');
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#4b5563')
    .text(`Periode ${periode}, sampai cutoff ${formatJakarta(snapshot.cutoffAt)} WIB`);
  doc.moveDown();

  for (const line of snapshot.lines) {
    const itemMovements = movementsByItem.get(line.itemId) || [];
    if (itemMovements.length === 0) continue;
    ensureSpace(48);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#111827')
      .text(`${line.namaItem} (${line.itemId})`);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#4b5563')
      .text(
        `Lokasi: ${line.lokasi || '-'} | Awal: ${line.saldoAwal} | IN: ${line.totalIn} | OUT: ${line.totalOut} | ADJ: ${line.totalAdj} | Stok: ${line.stokSistem}`
      );
    doc.moveDown(0.35);

    const detailWidths = [90, 42, 42, 100, pageWidth - 274];
    const detailHeaders = ['Tanggal', 'Tipe', 'Qty', 'PIC', 'Keterangan'];
    const drawDetailHeader = () => {
      const y = doc.y;
      doc.rect(doc.page.margins.left, y, pageWidth, 16).fill('#e5e7eb');
      let x = doc.page.margins.left + 4;
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111827');
      detailHeaders.forEach((label, i) => {
        doc.text(label, x, y + 4, { width: detailWidths[i] - 6, lineBreak: false });
        x += detailWidths[i];
      });
      doc.y = y + 16;
    };
    drawDetailHeader();

    for (const movement of itemMovements) {
      if (doc.y + 17 > bottom()) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text(`${line.namaItem} (lanjutan)`);
        doc.moveDown(0.3);
        drawDetailHeader();
      }
      const y = doc.y;
      const isBackdate = movement.createdAt.getTime() > snapshot.cutoffAt.getTime();
      const description = [
        isBackdate ? '[BACKDATE]' : null,
        movement.purchaseType,
        movement.vendor,
        movement.keterangan,
      ]
        .filter(Boolean)
        .join(' | ');
      const values = [
        formatJakarta(movement.tanggal),
        movement.tipe,
        String(movement.qty),
        cleanText(movement.picNama),
        cleanText(description),
      ];
      let x = doc.page.margins.left + 4;
      doc.font('Helvetica').fontSize(6.5).fillColor('#1f2937');
      values.forEach((value, i) => {
        doc.text(value, x, y + 4, {
          width: detailWidths[i] - 6,
          ellipsis: true,
          lineBreak: false,
          align: i === 2 ? 'right' : 'left',
        });
        x += detailWidths[i];
      });
      doc
        .moveTo(doc.page.margins.left, y + 16)
        .lineTo(doc.page.width - doc.page.margins.right, y + 16)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();
      doc.y = y + 17;
    }
    doc.moveDown(0.7);
  }

  doc.end();
  const pdf = await completed;

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-trail-ga-${periode}.pdf"`,
      'Content-Length': String(pdf.length),
    },
  });
}
