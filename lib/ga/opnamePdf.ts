import PDFDocument from 'pdfkit';
import type { OpnameLineView } from '@/lib/ga/opnameService';
import { normalizeLokasiKey } from '@/lib/ga/opnameProgress';

export type OpnamePdfSession = {
  id: number;
  periodeNama: string;
  tanggal: string;
  status: string;
};

function cleanText(value: string | null | undefined) {
  return (value || '-').replace(/\s+/g, ' ').trim();
}

function formatJakartaNow() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function groupLinesByLokasi(lines: OpnameLineView[]) {
  const map = new Map<string, OpnameLineView[]>();
  for (const line of lines) {
    const key = normalizeLokasiKey(line.lokasi);
    const list = map.get(key) ?? [];
    list.push(line);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([lokasi, groupLines]) => ({
      lokasi,
      lines: groupLines.sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    }))
    .sort((a, b) => a.lokasi.localeCompare(b.lokasi, 'id'));
}

export function opnamePdfFilename(session: OpnamePdfSession) {
  return `opname-ga-${slugify(session.periodeNama) || 'sesi'}-${session.id}.pdf`;
}

export async function buildOpnamePdf(
  session: OpnamePdfSession,
  lines: OpnameLineView[],
  author?: string | null
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 28,
    info: {
      Title: `Stock Opname GA ${session.periodeNama}`,
      Author: author || 'GA Editor',
      Subject: 'Lembar kerja stock opname',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const FOOTER_HEIGHT = 24;
  const bottom = () => doc.page.height - doc.page.margins.bottom - FOOTER_HEIGHT;
  const rowHeight = 18;

  const addPageNumbers = () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pageNum = i - range.start + 1;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6b7280')
        .text(`Halaman ${pageNum} / ${range.count}`, doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 8, {
          width: pageWidth,
          align: 'center',
          lineBreak: false,
        });
    }
  };

  const drawSignatureBlock = () => {
    const blockHeight = 88;
    if (doc.y + blockHeight > bottom()) doc.addPage();

    doc.moveDown(1.2);
    const y = doc.y;
    const colWidth = pageWidth / 4;
    const roles = [
      { title: 'Dihitung Oleh,', role: 'Penghitung' },
      { title: 'Disiapkan Oleh,', role: 'GA Staff' },
      { title: 'Diketahui Oleh,', role: 'Supervisor GA' },
      { title: 'Disetujui Oleh,', role: 'Manufacture Manager' },
    ];

    roles.forEach((item, i) => {
      const x = doc.page.margins.left + i * colWidth;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#374151').text(item.title, x + 4, y, {
        width: colWidth - 8,
        align: 'center',
        lineBreak: false,
      });
      doc
        .moveTo(x + 8, y + 36)
        .lineTo(x + colWidth - 8, y + 36)
        .strokeColor('#9ca3af')
        .lineWidth(0.75)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#111827')
        .text(item.role, x + 4, y + 44, { width: colWidth - 8, align: 'center', lineBreak: false });
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#6b7280')
        .text('Nama: _______________________', x + 4, y + 58, { width: colWidth - 8, align: 'center', lineBreak: false });
      doc.text('Tgl: ________________________', x + 4, y + 70, { width: colWidth - 8, align: 'center', lineBreak: false });
    });

    doc.y = y + blockHeight;
  };

  const columns = [
    { label: 'No', width: 35, align: 'right' as const },
    { label: 'Nama Barang', width: 340, align: 'left' as const },
    { label: 'Lokasi', width: 120, align: 'left' as const },
    { label: 'Qty Fisik', width: 70, align: 'right' as const },
  ];

  const drawTableHeader = () => {
    const y = doc.y;
    doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#1f2937');
    let x = doc.page.margins.left + 4;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
    for (const col of columns) {
      doc.text(col.label, x, y + 5, { width: col.width - 6, align: col.align, lineBreak: false });
      x += col.width;
    }
    doc.y = y + rowHeight;
  };

  doc.font('Helvetica-Bold').fontSize(17).fillColor('#111827').text('LEMBAR KERJA STOCK OPNAME GA');
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  doc.text(`Periode: ${cleanText(session.periodeNama)}`);
  doc.text(`Tanggal opname: ${session.tanggal}`);
  doc.text(`No. sesi: SO-GA-${session.id} | Status: ${session.status}`);
  doc.text(`Digenerate: ${formatJakartaNow()} WIB`);
  doc.moveDown(0.8);

  const groups = groupLinesByLokasi(lines);

  for (const group of groups) {
    if (doc.y + rowHeight * 3 > bottom()) doc.addPage();

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111827')
      .text(`${group.lokasi} (${group.lines.length} barang)`);
    doc.moveDown(0.3);

    drawTableHeader();

    group.lines.forEach((line, index) => {
      if (doc.y + rowHeight > bottom()) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(`${group.lokasi} (lanjutan)`);
        doc.moveDown(0.3);
        drawTableHeader();
      }

      const y = doc.y;
      if (index % 2 === 1) doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#f3f4f6');

      const values = [
        String(index + 1),
        cleanText(line.nama),
        cleanText(group.lokasi),
        line.qtyFisik != null ? String(line.qtyFisik) : '',
      ];

      let x = doc.page.margins.left + 4;
      doc.font('Helvetica').fontSize(6.8).fillColor('#111827');
      values.forEach((value, colIndex) => {
        const col = columns[colIndex];
        doc.text(value, x, y + 5, {
          width: col.width - 6,
          align: col.align,
          ellipsis: true,
          lineBreak: false,
        });
        x += col.width;
      });
      doc.y = y + rowHeight;
    });

    doc.moveDown(0.6);
  }

  drawSignatureBlock();
  addPageNumbers();
  doc.end();
  return completed;
}
