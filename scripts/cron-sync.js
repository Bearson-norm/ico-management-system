const fs = require('fs');
const path = require('path');

// Manual loading of .env file
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) continue;
      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

async function main() {
  const host = process.env.HOST || '127.0.0.1';
  const port = process.env.PORT || '1325';
  const cronToken = process.env.CRON_TOKEN;

  if (!cronToken) {
    console.error('[Cron Sync] Error: CRON_TOKEN tidak ditemukan di environment variables / .env');
    process.exit(1);
  }

  const endpoints = [
    { name: 'MTC', url: `http://${host}:${port}/api/mtc/odoo/sync` },
    { name: 'GA', url: `http://${host}:${port}/api/ga/odoo/sync` }
  ];

  console.log(`[Cron Sync] Memulai sinkronisasi otomatis harian/berkala...`);

  let allSuccess = true;

  for (const ep of endpoints) {
    console.log(`\n[Cron Sync] [${ep.name}] Menghubungi endpoint: ${ep.url}`);
    try {
      const response = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cronToken}`
        },
        body: JSON.stringify({}) // Mengirim body kosong untuk memicu fallback env di server
      });

      console.log(`[Cron Sync] [${ep.name}] HTTP Status Code: ${response.status}`);
      
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        const rawText = await response.text();
        console.error(`[Cron Sync] [${ep.name}] Gagal mem-parse JSON response. Raw output: ${rawText}`);
        allSuccess = false;
        continue;
      }

      if (!response.ok || !result.success) {
        console.error(`[Cron Sync] [${ep.name}] Sinkronisasi GAGAL!`);
        console.error(`[Cron Sync] [${ep.name}] Error detail:`, JSON.stringify(result, null, 2));
        allSuccess = false;
        continue;
      }

      console.log(`[Cron Sync] [${ep.name}] Sinkronisasi BERHASIL!`);
      if (ep.name === 'MTC') {
        console.log(`  - Hasil Google Sheets:`, result.data?.sheets?.message || 'Tidak ada pesan');
        if (result.data?.sheets?.error) {
          console.warn(`  - Warning Sheets: ${result.data.sheets.error}`);
        }
        console.log(`  - Hasil Odoo Cloud:`, result.data?.odoo?.message || 'Tidak ada pesan');
        if (result.data?.odoo?.error) {
          console.warn(`  - Warning Odoo: ${result.data.odoo.error}`);
        }
      } else {
        console.log(`  - Hasil GA Odoo:`, result.data?.msg || result.message || 'Tidak ada pesan');
        if (result.data?.vendorUpdatedCount != null) {
          console.log(`  - Detail GA: Vendor updated: ${result.data.vendorUpdatedCount}, GR Confirmed: ${result.data.grConfirmedCount}, PR Imported: ${result.data.importedPrCount}`);
        }
      }
    } catch (error) {
      console.error(`[Cron Sync] [${ep.name}] Error koneksi ke server Next.js:`, error.message || error);
      allSuccess = false;
    }
  }

  if (allSuccess) {
    console.log(`\n[Cron Sync] Semua proses sinkronisasi selesai dengan sukses!`);
    process.exit(0);
  } else {
    console.error(`\n[Cron Sync] Ada proses sinkronisasi yang gagal.`);
    process.exit(1);
  }
}

main();
