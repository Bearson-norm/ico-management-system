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

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const resetX = () => {
    doc.x = left;
  };
  const ensureSpace = (height: number) => {
    if (doc.y + height > bottom()) {
      doc.addPage();
      resetX();
    }
  };

  type CellAlign = 'left' | 'right' | 'center';
  const drawCell = (
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    align: CellAlign,
    wrap = false
  ) => {
    doc.text(value, x, y, {
      width,
      height,
      align,
      ellipsis: true,
      lineBreak: wrap,
    });
  };

  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor('#111827')
    .text('LAPORAN AUDIT TRAIL GA', left, doc.y, { width: pageWidth, align: 'left' });
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  doc.text(`Periode: ${snapshot.periode}`, left, doc.y, { width: pageWidth, align: 'left' });
  doc.text(`Digenerate: ${formatJakarta(snapshot.generatedAt)} WIB`, left, doc.y, {
    width: pageWidth,
    align: 'left',
  });
  doc.text(`Cutoff: ${formatJakarta(snapshot.cutoffAt)} WIB | Sumber: ${snapshot.source}`, left, doc.y, {
    width: pageWidth,
    align: 'left',
  });

  const backdateItemIds = new Set(
    movements
      .filter((m) => m.itemId && m.createdAt.getTime() > snapshot.cutoffAt.getTime())
      .map((m) => m.itemId as string)
  );
  doc.moveDown(0.5);
  resetX();
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#111827')
    .text(
      `Ringkasan: ${snapshot.lines.length} barang | Barang dengan transaksi backdate: ${backdateItemIds.size}`,
      left,
      doc.y,
      { width: pageWidth, align: 'left' }
    );
  doc.moveDown(0.8);
  resetX();

  const summaryRowHeight = 18;
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
    doc.rect(left, y, pageWidth, summaryRowHeight).fill('#1f2937');
    let x = left + 4;
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#ffffff');
    for (const col of summaryColumns) {
      drawCell(col.label, x, y + 5, col.width - 6, summaryRowHeight - 6, col.align);
      x += col.width;
    }
    resetX();
    doc.y = y + summaryRowHeight;
  };

  drawSummaryHeader();
  snapshot.lines.forEach((line, index) => {
    if (doc.y + summaryRowHeight > bottom()) {
      doc.addPage();
      resetX();
      drawSummaryHeader();
    }
    const y = doc.y;
    if (index % 2 === 1) doc.rect(left, y, pageWidth, summaryRowHeight).fill('#f3f4f6');
    let x = left + 4;
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
      drawCell(cleanText(value), x, y + 5, col.width - 6, summaryRowHeight - 6, col.align);
      x += col.width;
    });
    resetX();
    doc.y = y + summaryRowHeight;
  });

  // Detail transaksi per barang
  doc.addPage();
  resetX();
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#111827')
    .text('DETAIL TRANSAKSI PER BARANG', left, doc.y, { width: pageWidth, align: 'left' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#4b5563')
    .text(`Periode ${periode}, sampai cutoff ${formatJakarta(snapshot.cutoffAt)} WIB`, left, doc.y, {
      width: pageWidth,
      align: 'left',
    });
  doc.moveDown();
  resetX();

  const detailHeaderHeight = 16;
  const detailRowMinHeight = 16;
  const detailPadY = 4;
  const detailColumns = [
    { label: 'Tanggal', width: 100, align: 'left' as const, wrap: false },
    { label: 'Tipe', width: 42, align: 'left' as const, wrap: false },
    { label: 'Qty', width: 42, align: 'right' as const, wrap: false },
    { label: 'PIC', width: 110, align: 'left' as const, wrap: false },
    { label: 'Keterangan', width: pageWidth - 294, align: 'left' as const, wrap: true },
  ];
  const ketCol = detailColumns[4];
  const itemTitleBlock = 12 + 10 + 6 + detailHeaderHeight + detailRowMinHeight;

  const drawDetailHeader = () => {
    const y = doc.y;
    doc.rect(left, y, pageWidth, detailHeaderHeight).fill('#e5e7eb');
    let x = left + 4;
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111827');
    for (const col of detailColumns) {
      drawCell(col.label, x, y + 4, col.width - 6, detailHeaderHeight - 6, col.align);
      x += col.width;
    }
    resetX();
    doc.y = y + detailHeaderHeight;
  };

  const drawItemHeading = (title: string, subtitle?: string) => {
    resetX();
    doc
      .font('Helvetica-Bold')
      .fontSize(subtitle ? 9 : 8)
      .fillColor('#111827')
      .text(title, left, doc.y, { width: pageWidth, align: 'left' });
    if (subtitle) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#4b5563')
        .text(subtitle, left, doc.y, { width: pageWidth, align: 'left' });
    }
    doc.moveDown(0.35);
    resetX();
  };

  for (const line of snapshot.lines) {
    const itemMovements = movementsByItem.get(line.itemId) || [];
    if (itemMovements.length === 0) continue;
    ensureSpace(itemTitleBlock);
    drawItemHeading(
      `${line.namaItem} (${line.itemId})`,
      `Lokasi: ${line.lokasi || '-'} | Awal: ${line.saldoAwal} | IN: ${line.totalIn} | OUT: ${line.totalOut} | ADJ: ${line.totalAdj} | Stok: ${line.stokSistem}`
    );
    drawDetailHeader();

    for (const movement of itemMovements) {
      const isBackdate = movement.createdAt.getTime() > snapshot.cutoffAt.getTime();
      const description = cleanText(
        [isBackdate ? '[BACKDATE]' : null, movement.purchaseType, movement.vendor, movement.keterangan]
          .filter(Boolean)
          .join(' | ')
      );
      const values = [
        formatJakarta(movement.tanggal),
        movement.tipe,
        String(movement.qty),
        cleanText(movement.picNama),
        description,
      ];

      doc.font('Helvetica').fontSize(6.5);
      const ketHeight = doc.heightOfString(description, { width: ketCol.width - 6 });
      let rowHeight = Math.max(detailRowMinHeight, Math.ceil(ketHeight) + detailPadY * 2);

      if (doc.y + rowHeight > bottom()) {
        doc.addPage();
        resetX();
        drawItemHeading(`${line.namaItem} (lanjutan)`);
        drawDetailHeader();
        const remaining = bottom() - doc.y;
        if (rowHeight > remaining) rowHeight = Math.max(detailRowMinHeight, remaining);
      }

      const y = doc.y;
      let x = left + 4;
      doc.font('Helvetica').fontSize(6.5).fillColor('#1f2937');
      values.forEach((value, i) => {
        const col = detailColumns[i];
        drawCell(value, x, y + detailPadY, col.width - 6, rowHeight - detailPadY, col.align, col.wrap);
        x += col.width;
      });
      doc
        .moveTo(left, y + rowHeight)
        .lineTo(left + pageWidth, y + rowHeight)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();
      resetX();
      doc.y = y + rowHeight;
    }
    doc.moveDown(0.7);
    resetX();
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
