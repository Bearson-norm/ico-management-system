import { PrismaClient } from '../lib/generated/mtc';

const rawData = `nama\ttipe\tarea
Mesin Filling 01 Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Filling 02 Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Capping 01 Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Capping 02 Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Cellophane Cartridge\tPerbaikan\tCartridge Gedung G5
Mesin Cek Alat Device\tPerbaikan\tDevice Gedung G7
Authenticity Device\tPerbaikan\tDevice Gedung G7
Mesin Shrink Liquid Kecil\tPerbaikan\tLiquid 15 Ml Gedung F2
Mesin Sticker 01 Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Sticker 02 Liquid\tPerbaikan\tLiquid Gedung G1
Mesin L-Sealer 01 Device\tPerbaikan\tDevice Gedung G7
Mesin L-Sealer 02 Device\tPerbaikan\tDevice Gedung G7
Conveyor 01 Cartridge\tPerbaikan\tCartridge Gedung G5
Conveyor 02 Cartridge\tPerbaikan\tCartridge Gedung G5
Conveyor 03 Cartridge\tPerbaikan\tCartridge Gedung G5
Conveyor 01 Liquid\tPerbaikan\tLiquid Gedung G1
Conveyor 02 Liquid\tPerbaikan\tLiquid Gedung G1
Conveyor 03 Liquid\tPerbaikan\tLiquid Gedung G1
Conveyor 04 Liquid\tPerbaikan\tLiquid Gedung G1
Mixer 01 Liquid\tPerbaikan\tLiquid Gedung G1
Mixer 02 Liquid\tPerbaikan\tLiquid Gedung G1
Authenticity Liquid\tPerbaikan\tLiquid Gedung G1
Mixer 03 Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Blister Pod X Cartridge\tPerbaikan\tCartridge Gedung G5
Shrink Tunnel Liquid 15 Ml Liquid\tPerbaikan\tLiquid 15 Ml Gedung F2
Shrink Tunnel 01 Device Besar\tPerbaikan\tDevice Gedung G7
Shrink Tunnel 02 Device Kecil\tPerbaikan\tDevice Gedung G7
Coding 01 Liquid\tPerbaikan\tLiquid Gedung G1
Coding 02 Liquid\tPerbaikan\tLiquid Gedung G1
Coding 03 Liquid\tPerbaikan\tLiquid Gedung G1
Coding 04 Cartridge\tPerbaikan\tCartridge Gedung G5
Coding 05 Device\tPerbaikan\tDevice Gedung G7
Authenticity Cartridge\tPerbaikan\tCartridge Gedung G5
Carton Sealer Liquid\tPerbaikan\tLiquid Gedung G1
Carton Sealer Device\tPerbaikan\tDevice Gedung G7
Carton Sealer Cartridge\tPerbaikan\tCartridge Gedung G5
Mesin Blister Pod Y Cartridge\tPerbaikan\tCartridge Gedung G5
Mesin Bottomless 01 Liquid Kecil\tPerbaikan\tLiquid Gedung G1
Mesin Bottomless 02 Liquid Besar\tPerbaikan\tLiquid Gedung G1
Kompressor Screw\tPerbaikan\tCartridge Gedung G5
Mesin Lanyard 01 Device\tPerbaikan\tDevice Gedung G7
Mesin Lanyard 02 Device\tPerbaikan\tDevice Gedung G7
Mesin Conveyer Device\tPerbaikan\tDevice Gedung G7
Mesin Scanner Device\tPerbaikan\tDevice Gedung G7
Mesin Scanner Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Scanner Cartridge\tPerbaikan\tCartridge Gedung G5
Mesin Capping 15Ml (Manual) Liquid\tPerbaikan\tLiquid 15 Ml Gedung F2
Mesin Sticker 15Ml Liquid\tPerbaikan\tLiquid 15 Ml Gedung F2
Jembatan Labelling Line 1 Liquid\tPerbaikan\tLiquid Gedung G1
Jembatan Labelling Line 2 Liquid\tPerbaikan\tLiquid Gedung G1
Conveyor Botol 1 Liquid\tPerbaikan\tLiquid Gedung G1
Round Table Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Resistansi Cartridge\tPerbaikan\tCartridge Gedung G5
Mesin Cellophane Device\tPerbaikan\tDevice Gedung G7
Mesin Kompressor Device\tPerbaikan\tDevice Gedung G7
Timbangan Mixing Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Capping 02 Servo Liquid\tPerbaikan\tLiquid Gedung G1
Mesin Cellophane Device\tSparepart\t-
Mesin Cek Alat Device\tSparepart\t-
Mesin Conveyor Device\tSparepart\t-
Mesin Conveyor Liquid\tSparepart\t-
Mesin Capping Four Wheel Liquid\tSparepart\t-
Mesin Capping Cam Liquid\tSparepart\t-
Mesin FIlling Liquid\tSparepart\t-
Mesin Sticker Liquid\tSparepart\t-
Mesin L - Sealer Device\tSparepart\t-
Authenticity\tSparepart\t-
Mesin Carton Sealer\tSparepart\t-
Mesin Blister Pod Y Cartridge\tSparepart\t-
Mesin Blister Pod X Cartridge\tSparepart\t-
Mesin Shrink Kecil\tSparepart\t-
Mesin Shrink Tunnel Besar\tSparepart\t-
Conveyor Bottomles 01 Liquid Kecil\tSparepart\t-
Conveyer Bottomles 02 Liquid Besar\tSparepart\t-
Mesin Resistansi Cartridge\tSparepart\t-
Mesin Scanner\tSparepart\t-
Round Table Liquid\tSparepart\t-
Mesin Cellophane Cartridge\tSparepart\t-
Conveyor 01 Cartridge\tSparepart\t-
Conveyor 02 Cartridge\tSparepart\t-
Conveyor 03 Cartridge\tSparepart\t-
Kompressor Screw\tSparepart\t-
Mesin Scanner Cartridge\tSparepart\t-
Mesin Resistansi Cartridge\tSparepart\t-
Carton Sealer Cartridge\tSparepart\t-`;

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Memproses data mesin dari user...');

  // Group by nama
  const map = new Map<string, { nama: string; tipes: Set<string>; area: string | null }>();

  const lines = rawData.split('\n').slice(1);
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const nama = parts[0].trim();
    const tipe = parts[1].trim().toLowerCase();
    const areaRaw = parts[2] ? parts[2].trim() : null;
    const area = (areaRaw && areaRaw !== '-') ? areaRaw : null;

    if (!map.has(nama)) {
      map.set(nama, { nama, tipes: new Set([tipe]), area });
    } else {
      const existing = map.get(nama)!;
      existing.tipes.add(tipe);
      if (!existing.area && area) {
        existing.area = area;
      }
    }
  }

  console.log(`📊 Total baris input: ${lines.length}`);
  console.log(`✨ Unique Mesin: ${map.size}`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const [nama, data] of map.entries()) {
    let finalTipe = 'keduanya';
    if (data.tipes.has('perbaikan') && data.tipes.has('sparepart')) {
      finalTipe = 'keduanya';
    } else if (data.tipes.has('perbaikan')) {
      finalTipe = 'perbaikan';
    } else if (data.tipes.has('sparepart')) {
      finalTipe = 'sparepart';
    }

    const existing = await prisma.mesin.findUnique({ where: { nama } });
    if (existing) {
      await prisma.mesin.update({
        where: { id: existing.id },
        data: {
          tipe: finalTipe,
          area: data.area || existing.area,
          aktif: true,
        },
      });
      updatedCount++;
    } else {
      await prisma.mesin.create({
        data: {
          nama,
          tipe: finalTipe,
          area: data.area,
          aktif: true,
        },
      });
      createdCount++;
    }
  }

  console.log(`✅ Selesai! Created: ${createdCount}, Updated: ${updatedCount}`);

  // Summary current DB state
  const totalCount = await prisma.mesin.count();
  const byTipe = await prisma.mesin.groupBy({
    by: ['tipe'],
    _count: { id: true },
  });

  console.log('\n=== STATUS MESIN DI DATABASE SEKARANG ===');
  console.log('Total Mesin:', totalCount);
  console.log('Per rincian tipe:', byTipe);
}

main().catch(console.error).finally(() => prisma.$disconnect());
