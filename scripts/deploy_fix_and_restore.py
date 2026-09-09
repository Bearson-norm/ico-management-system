import paramiko
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

HOST = '103.31.39.189'
USER = 'foom'
PASS = 'FoomIOT2025!'

print("1. Connecting to VPS...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)
sftp = ssh.open_sftp()

LOCAL_FILE = os.path.join(os.getcwd(), 'app', 'api', 'mtc', 'odoo', 'sync', 'route.ts')
REMOTE_FILE = '/var/www/ico-management-system/app/api/mtc/odoo/sync/route.ts'

print(f"2. Uploading {LOCAL_FILE} to VPS {REMOTE_FILE}...")
sftp.put(LOCAL_FILE, REMOTE_FILE)
print("   Uploaded successfully.")

restore_db_script = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function restore() {
  console.log('--- RESTORING PR04674 (Sprockets split) ---');
  // Item 140 (Sprocket 12T received 1 pc)
  await prisma.procurementTracking.update({
    where: { id: 140 },
    data: { qty: 1, tanggalTerima: new Date('2026-09-08T12:00:00.000Z') }
  });
  // Item 1999 (Sprocket 12T pending remainder 2 pcs)
  await prisma.procurementTracking.update({
    where: { id: 1999 },
    data: { qty: 2, tanggalTerima: null }
  });
  // Item 141 (Sprocket 15T received 1 pc)
  await prisma.procurementTracking.update({
    where: { id: 141 },
    data: { qty: 1, tanggalTerima: new Date('2026-09-08T12:00:00.000Z') }
  });
  // Item 2000 (Sprocket 15T pending remainder 2 pcs)
  await prisma.procurementTracking.update({
    where: { id: 2000 },
    data: { qty: 2, tanggalTerima: null }
  });
  console.log('PR04674 items restored.');

  console.log('--- RESTORING PR04699 (Push buttons & Solenoid) ---');
  const pr4699Items = [
    { id: 148, date: '2026-09-01T05:00:00.000Z' },
    { id: 150, date: '2026-09-01T05:00:00.000Z' },
    { id: 151, date: '2026-09-01T05:00:00.000Z' }
  ];
  for (const it of pr4699Items) {
    await prisma.procurementTracking.update({
      where: { id: it.id },
      data: { tanggalTerima: new Date(it.date) }
    });
  }
  console.log('PR04699 items restored.');

  console.log('--- RESTORING OTHER AFFECTED ITEMS FROM MOVEMENTS ---');
  const otherIds = [70, 772, 773, 774, 775, 776, 789, 792, 793];
  for (const id of otherIds) {
    const item = await prisma.procurementTracking.findUnique({ where: { id } });
    if (!item) continue;
    let physicalMovement = await prisma.stockMovement.findFirst({
      where: {
        OR: [
          { keterangan: { contains: `[Penerimaan Pengadaan #${item.id}` } },
          { keterangan: { contains: `[Penerimaan Paket #${item.id}` } },
        ]
      },
      orderBy: { id: 'desc' }
    });
    if (!physicalMovement && item.sparepartId && (item.nomorPo || item.nomorPr)) {
      const legacyMov = await prisma.stockMovement.findFirst({
        where: {
          sparepartId: item.sparepartId,
          tipe: { in: ['IN', 'LOG'] },
          ...(item.nomorPo ? { keterangan: { contains: `PO: ${item.nomorPo}` } } : {}),
          ...(item.nomorPr ? { keterangan: { contains: `PR: ${item.nomorPr}` } } : {})
        },
        orderBy: { id: 'desc' }
      });
      if (legacyMov && !legacyMov.keterangan.includes('[Penerimaan Pengadaan #') && !legacyMov.keterangan.includes('[Penerimaan Paket #')) {
        physicalMovement = legacyMov;
      }
    }
    if (physicalMovement && physicalMovement.tanggal) {
      await prisma.procurementTracking.update({
        where: { id: item.id },
        data: { tanggalTerima: new Date(physicalMovement.tanggal) }
      });
      console.log(`Restored ID ${item.id} (${item.originalName}) with date ${physicalMovement.tanggal}`);
    }
  }

  console.log('All affected rows restored.');
}

restore().catch(console.error).finally(() => prisma.$disconnect());
""";

print("3. Uploading and executing DB restore script on VPS...")
with sftp.file('/tmp/restore_db_rows.js', 'w') as f:
    f.write(restore_db_script)

stdin, stdout, stderr = ssh.exec_command('node /tmp/restore_db_rows.js')
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err: print('DB Restore ERR:', err)

print("4. Building Next.js application on VPS (npm run build)...")
stdin, stdout, stderr = ssh.exec_command('cd /var/www/ico-management-system && npm run build')
# Stream build output
for line in iter(stdout.readline, ""):
    if line:
        print("   " + line.strip())
err = stderr.read().decode('utf-8')
if err:
    print("Build stderr (if any):", err)

print("5. Reloading PM2 inventory process...")
stdin, stdout, stderr = ssh.exec_command('pm2 reload inventory')
print(stdout.read().decode('utf-8'))

time.sleep(3)

print("6. Triggering Odoo Sync via API on VPS...")
stdin, stdout, stderr = ssh.exec_command("curl -s -X POST http://127.0.0.1:1325/api/mtc/odoo/sync -H 'Content-Type: application/json' -d '{}'")
sync_response = stdout.read().decode('utf-8')
print("Sync Response:", sync_response)

print("7. Verifying DB state after sync...")
verify_script = """
const { PrismaClient } = require('/var/www/ico-management-system/lib/generated/mtc');
const prisma = new PrismaClient();

async function verify() {
  console.log('=== PR04674 POST-SYNC ITEMS ===');
  const pr4674 = await prisma.procurementTracking.findMany({
    where: { nomorPr: 'PR04674' },
    orderBy: { id: 'asc' }
  });
  for (const it of pr4674) {
    console.log(`- ID: ${it.id} | Name: "${it.originalName}" | Qty: ${it.qty} | PO: ${it.nomorPo} | StatusPO: ${it.statusPo} | Terima: ${it.tanggalTerima}`);
  }

  console.log('=== PR04699 POST-SYNC ITEMS ===');
  const pr4699 = await prisma.procurementTracking.findMany({
    where: { nomorPr: 'PR04699' },
    orderBy: { id: 'asc' }
  });
  for (const it of pr4699) {
    console.log(`- ID: ${it.id} | Name: "${it.originalName}" | Qty: ${it.qty} | PO: ${it.nomorPo} | StatusPO: ${it.statusPo} | Terima: ${it.tanggalTerima}`);
  }

  console.log('=== MASTER SPAREPARTS STATUS ===');
  const spIds = ['MTC-SP-368', 'MTC-SP-369', 'MTC-SP-373', 'MTC-SP-374', 'MTC-SP-375'];
  const sps = await prisma.sparepart.findMany({
    where: { id: { in: spIds } }
  });
  for (const sp of sps) {
    console.log(`- Sparepart: ${sp.id} (${sp.nama}) | Status: ${sp.purchasingStatus} | PurchasingQty: ${sp.purchasingQty} | PurchasingPO: ${sp.purchasingNoPo}`);
  }
}

verify().catch(console.error).finally(() => prisma.$disconnect());
""";

with sftp.file('/tmp/verify_after_sync.js', 'w') as f:
    f.write(verify_script)

stdin, stdout, stderr = ssh.exec_command('node /tmp/verify_after_sync.js')
print(stdout.read().decode('utf-8'))

sftp.close()
ssh.close()
print("Done!")
