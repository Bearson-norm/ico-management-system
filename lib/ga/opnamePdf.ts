import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { OpnameLineView } from '@/lib/ga/opnameService';
import { compareLocations } from '@/lib/utils';

export type OpnamePdfSession = {
  id: number;
  periodeNama: string;
  tanggal: string;
  status: string;
  lokasi?: string | null;
};

function cleanText(value: string | null | undefined) {
  return (value || '—').replace(/\s+/g, ' ').trim();
}

function formatJakartaNow() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatTanggalId(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function statusLabel(status: string) {
  if (status === 'posted') return 'TER-POSTING';
  if (status === 'waiting_approval') return 'MENUNGGU ACC';
  return 'DRAFT';
}

function sortLines(lines: OpnameLineView[]) {
  return [...lines].sort((a, b) => {
    const locDiff = compareLocations(a.lokasi, b.lokasi);
    if (locDiff !== 0) return locDiff;
    return (a.nama || '').trim().localeCompare((b.nama || '').trim(), 'id', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function buildStats(lines: OpnameLineView[]) {
  const counted = lines.filter((l) => l.counted);
  const matching = counted.filter((l) => l.selisih === 0);
  const minus = counted.filter((l) => l.selisih != null && l.selisih < 0);
  const plus = counted.filter((l) => l.selisih != null && l.selisih > 0);
  const minusQty = minus.reduce((acc, l) => acc + Math.abs(l.selisih || 0), 0);
  const plusQty = plus.reduce((acc, l) => acc + (l.selisih || 0), 0);
  const denom = counted.length || 0;
  const accuracyPct = denom > 0 ? ((matching.length / denom) * 100).toFixed(1) : '0.0';
  return {
    totalItems: lines.length,
    counted: counted.length,
    matching: matching.length,
    minusCount: minus.length,
    plusCount: plus.length,
    minusQty,
    plusQty,
    accuracyPct,
  };
}

export function opnamePdfFilename(session: OpnamePdfSession) {
  return `laporan-opname-ga-${slugify(session.periodeNama) || 'sesi'}-${session.id}.pdf`;
}

export async function buildOpnamePdf(
  session: OpnamePdfSession,
  lines: OpnameLineView[],
  author?: string | null
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: 32,
    bufferPages: true,
    info: {
      Title: `Laporan Hasil Stock Opname GA ${session.periodeNama}`,
      Author: author || 'GA Editor',
      Subject: 'Laporan rekapitulasi hasil stock opname',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const FOOTER_HEIGHT = 22;
  const bottom = () => doc.page.height - doc.page.margins.bottom - FOOTER_HEIGHT;
  const rowHeight = 18;
  const stats = buildStats(lines);
  const sortedLines = sortLines(lines);

  const strokeBlack = () => {
    doc.lineWidth(0.7).strokeColor('#000000');
  };

  const drawCell = (
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    opts: {
      align?: 'left' | 'center' | 'right';
      bold?: boolean;
      fill?: string;
      fontSize?: number;
      color?: string;
      valign?: 'middle' | 'top';
    } = {}
  ) => {
    if (opts.fill) {
      doc.rect(x, y, w, h).fill(opts.fill);
    }
    strokeBlack();
    doc.rect(x, y, w, h).stroke();
    const fontSize = opts.fontSize ?? 7.5;
    const padX = 3;
    const textY = opts.valign === 'top' ? y + 3 : y + Math.max(2, (h - fontSize) / 2 - 1);
    doc
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fontSize)
      .fillColor(opts.color || '#000000')
      .text(text, x + padX, textY, {
        width: w - padX * 2,
        align: opts.align || 'left',
        ellipsis: true,
        lineBreak: false,
      });
  };

  const addPageNumbers = () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pageNum = i - range.start + 1;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000000')
        .text(`Halaman ${pageNum} / ${range.count}`, left, doc.page.height - doc.page.margins.bottom + 6, {
          width: pageWidth,
          align: 'center',
          lineBreak: false,
        });
    }
  };

  const drawKop = () => {
    const y = doc.y;
    const kopH = 54;
    const rowH = kopH / 3;
    const logoW = pageWidth * 0.2;
    const centerW = pageWidth * 0.42;
    const labelW = pageWidth * 0.14;
    const valueW = pageWidth - logoW - centerW - labelW;
    const xLogo = left;
    const xCenter = xLogo + logoW;
    const xLabel = xCenter + centerW;
    const xValue = xLabel + labelW;

    strokeBlack();
    doc.rect(left, y, pageWidth, kopH).stroke();
    doc.moveTo(xCenter, y).lineTo(xCenter, y + kopH).stroke();
    doc.moveTo(xLabel, y).lineTo(xLabel, y + kopH).stroke();
    doc.moveTo(xValue, y).lineTo(xValue, y + kopH).stroke();
    doc.moveTo(xCenter, y + rowH).lineTo(left + pageWidth, y + rowH).stroke();
    doc.moveTo(xCenter, y + rowH * 2).lineTo(left + pageWidth, y + rowH * 2).stroke();

    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, xLogo + 8, y + 8, { fit: [logoW - 16, kopH - 16], align: 'center', valign: 'center' });
    } else {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('FOOM', xLogo + 4, y + 20, {
        width: logoW - 8,
        align: 'center',
        lineBreak: false,
      });
    }

    const center = (text: string, row: number, size: number) => {
      doc.font('Helvetica-Bold').fontSize(size).fillColor('#000000').text(text, xCenter + 4, y + row * rowH + 4, {
        width: centerW - 8,
        align: 'center',
        lineBreak: false,
      });
    };
    center('PT. FOOM Lab Global', 0, 10);
    center('Cikupa Factory', 1, 9);
    center('LAPORAN HASIL REKAPITULASI STOCK OPNAME GA', 2, 8);

    const rightPair = (label: string, value: string, row: number, valueBold = false) => {
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(label, xLabel + 4, y + row * rowH + 5, {
        width: labelW - 8,
        lineBreak: false,
      });
      doc.font(valueBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#000000').text(value, xValue + 4, y + row * rowH + 5, {
        width: valueW - 8,
        lineBreak: false,
      });
    };
    rightPair('No. Dokumen', 'FLG/FORM/GA/013-00', 0, true);
    rightPair('Revisi', '00', 1);
    rightPair('Tanggal', formatTanggalId(session.tanggal), 2);

    doc.y = y + kopH + 8;
  };

  const drawMeta = () => {
    const y = doc.y;
    const lineH = 13;
    const col1 = 78;
    const col2 = pageWidth / 2 - col1;
    const col3 = 78;
    const rows: [string, string, string, string][] = [
      ['Nama Periode', cleanText(session.periodeNama), 'No. Sesi SO', `SO-GA-${session.id} (${statusLabel(session.status)})`],
      [
        'Cakupan Audit',
        cleanText(session.lokasi) === '—' ? 'Semua Gedung / Lokasi GA' : cleanText(session.lokasi),
        'Tanggal Cetak',
        formatJakartaNow() + ' WIB',
      ],
    ];
    rows.forEach((row, i) => {
      const yy = y + i * lineH;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000').text(row[0], left, yy, { width: col1, lineBreak: false });
      doc.font('Helvetica').fontSize(8).text(`: ${row[1]}`, left + col1, yy, { width: col2 - 8, lineBreak: false });
      doc.font('Helvetica-Bold').text(row[2], left + pageWidth / 2, yy, { width: col3, lineBreak: false });
      doc.font('Helvetica').text(`: ${row[3]}`, left + pageWidth / 2 + col3, yy, { width: pageWidth / 2 - col3, lineBreak: false });
    });
    doc.y = y + rows.length * lineH + 8;
  };

  const drawSummaryTable = () => {
    const y = doc.y;
    const labelH = 16;
    const valueH = 22;
    const subH = 14;
    const h = labelH + valueH + subH;
    const cols = [
      { label: 'Total Item Audit', value: `${stats.totalItems} Item`, sub: `(${stats.counted} Dihitung)` },
      { label: 'Akurasi Data', value: `${stats.accuracyPct}%`, sub: `(${stats.matching} Sesuai)` },
      { label: 'Sesuai (Selisih 0)', value: `${stats.matching} Item`, sub: '0 Selisih' },
      { label: 'Total Minus', value: `-${stats.minusQty} Pcs`, sub: `(${stats.minusCount} Item)` },
      { label: 'Total Plus', value: `+${stats.plusQty} Pcs`, sub: `(${stats.plusCount} Item)` },
    ];
    const w = pageWidth / cols.length;
    strokeBlack();
    doc.rect(left, y, pageWidth, h).stroke();
    cols.forEach((col, i) => {
      const x = left + i * w;
      if (i > 0) doc.moveTo(x, y).lineTo(x, y + h).stroke();
      doc.font('Helvetica').fontSize(6.5).fillColor('#000000').text(col.label, x + 3, y + 4, {
        width: w - 6,
        align: 'center',
        lineBreak: false,
      });
      doc.font('Helvetica-Bold').fontSize(10).text(col.value, x + 3, y + labelH + 4, {
        width: w - 6,
        align: 'center',
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(6.5).text(col.sub, x + 3, y + labelH + valueH + 2, {
        width: w - 6,
        align: 'center',
        lineBreak: false,
      });
    });
    doc.y = y + h + 8;
  };

  const columns = [
    { label: 'No', width: 24, align: 'center' as const },
    { label: 'Kode Barang', width: 54, align: 'left' as const },
    { label: 'Nama Barang GA', width: 148, align: 'left' as const },
    { label: 'Lokasi / Gedung', width: 62, align: 'center' as const },
    { label: 'Satuan', width: 36, align: 'center' as const },
    { label: 'Qty Sis', width: 48, align: 'right' as const },
    { label: 'Qty Fis', width: 48, align: 'right' as const },
    { label: 'Selisih', width: 52, align: 'right' as const },
    { label: 'PIC', width: 59, align: 'center' as const },
  ];

  const drawTableHeader = () => {
    const y = doc.y;
    let x = left;
    for (const col of columns) {
      drawCell(x, y, col.width, rowHeight, col.label, {
        align: 'center',
        bold: true,
        fill: '#f1f5f9',
        fontSize: 7,
      });
      x += col.width;
    }
    doc.y = y + rowHeight;
  };

  const selisihText = (line: OpnameLineView) => {
    if (!line.counted || line.selisih == null) return 'Belum';
    if (line.selisih > 0) return `+${line.selisih}`;
    if (line.selisih < 0) return `${line.selisih}`;
    return '0';
  };

  const drawSignatureBlock = () => {
    const blockH = 92;
    const gap = 6;
    if (doc.y + blockH + 8 > bottom()) doc.addPage();
    doc.y += 10;
    const y = doc.y;
    const colW = (pageWidth - gap * 3) / 4;
    const roles = [
      { title: 'Dihitung Oleh,', role: 'Penghitung (Staff Audit)' },
      { title: 'Disiapkan Oleh,', role: 'GA (Staff General Affairs)' },
      { title: 'Diketahui Oleh,', role: 'Supervisor GA' },
      { title: 'Disetujui Oleh,', role: 'Manufacture Manager' },
    ];
    roles.forEach((item, i) => {
      const x = left + i * (colW + gap);
      strokeBlack();
      doc.rect(x, y, colW, blockH).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000').text(item.title, x + 4, y + 8, {
        width: colW - 8,
        align: 'center',
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(6.5).text(item.role, x + 4, y + 20, {
        width: colW - 8,
        align: 'center',
      });
      doc
        .moveTo(x + 10, y + 62)
        .lineTo(x + colW - 10, y + 62)
        .stroke();
      doc.font('Helvetica').fontSize(6.5).text('Nama & Tanggal', x + 4, y + 68, {
        width: colW - 8,
        align: 'center',
        lineBreak: false,
      });
    });
    doc.y = y + blockH;
  };

  drawKop();
  drawMeta();
  drawSummaryTable();
  drawTableHeader();

  sortedLines.forEach((line, index) => {
    if (doc.y + rowHeight > bottom()) {
      doc.addPage();
      drawTableHeader();
    }

    const y = doc.y;
    const fill = index % 2 === 1 ? '#fafafa' : undefined;
    const values = [
      String(index + 1),
      cleanText(line.kodeBarang || line.itemId),
      cleanText(line.nama),
      cleanText(line.lokasi),
      cleanText(line.uom || 'Pcs'),
      String(line.qtySistem),
      line.qtyFisik == null ? '—' : String(line.qtyFisik),
      selisihText(line),
      cleanText(line.picNama),
    ];
    let x = left;
    values.forEach((value, colIndex) => {
      const col = columns[colIndex];
      drawCell(x, y, col.width, rowHeight, value, {
        align: col.align,
        bold: colIndex === 2 || (colIndex === 7 && line.counted && !!line.selisih),
        fill,
        fontSize: colIndex === 1 ? 6.5 : 7.5,
      });
      x += col.width;
    });
    doc.y = y + rowHeight;
  });

  drawSignatureBlock();
  addPageNumbers();
  doc.end();
  return completed;
}
