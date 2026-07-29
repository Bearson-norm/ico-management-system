import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function main() {
  const mtc = new MtcPrisma();

  try {
    console.time('Prisma select query without odooNotes');
    const rawData = await mtc.procurementTracking.findMany({
      select: {
        id: true,
        fbIndex: true,
        originalName: true,
        sparepartId: true,
        keterangan: true,
        penggunaanBulan: true,
        kontrak3Bulan: true,
        tanggalList: true,
        qty: true,
        productCategory: true,
        reason: true,
        urgency: true,
        linkReferences: true,
        vendor: true,
        harga: true,
        nomorPr: true,
        statusPr: true,
        statusPa: true,
        statusPo: true,
        nomorPo: true,
        etaFoom: true,
        linkGr: true,
        tanggalTerima: true,
        sheetId: true,
        isStocked: true,
        linkedPartsJson: true,
        createdAt: true,
        updatedAt: true,
        odooNotes: true,
        sparepart: {
          select: {
            id: true,
            nama: true,
            namaAlias: true,
            uom: true,
            lokasi: true,
            harga: true,
            minQty: true,
            linkReference: true,
            alasan: true,
            purchasingStatus: true,
          }
        }
      },
      orderBy: [
        { urgency: 'desc' },
        { fbIndex: 'desc' },
        { tanggalList: 'desc' }
      ]
    });
    console.timeEnd('Prisma select query without odooNotes');

    // Convert odooNotes to boolean indicator for the list API
    const data = rawData.map(item => ({
      ...item,
      hasOdooNotes: !!item.odooNotes,
      odooNotes: item.odooNotes ? undefined : undefined // exclude heavy text from list JSON payload
    }));

    const jsonStr = JSON.stringify(data);
    const sizeInMb = (Buffer.byteLength(jsonStr, 'utf8') / (1024 * 1024)).toFixed(2);
    console.log(`Total rows: ${data.length}`);
    console.log(`Payload JSON size WITHOUT heavy odooNotes text: ${sizeInMb} MB`);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
