import fs from 'fs';
import path from 'path';

// Manual loading of .env file to avoid dependency issues in ts-node
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

// Load environment variables
loadEnv();

async function main() {
  const host = process.env.HOST || '127.0.0.1';
  const port = process.env.PORT || '1325';
  const cronToken = process.env.CRON_TOKEN;

  if (!cronToken) {
    console.error('[Cron Sync] Error: CRON_TOKEN tidak ditemukan di environment variables / .env');
    process.exit(1);
  }

  const syncUrl = `http://${host}:${port}/api/mtc/odoo/sync`;
  console.log(`[Cron Sync] Memulai sinkronisasi harian otomatis...`);
  console.log(`[Cron Sync] Menghubungi endpoint: ${syncUrl}`);

  try {
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronToken}`
      },
      body: JSON.stringify({}) // Mengirim body kosong untuk memicu fallback env di server
    });

    console.log(`[Cron Sync] HTTP Status Code: ${response.status}`);
    
    let result: any;
    try {
      result = await response.json();
    } catch (parseError) {
      const rawText = await response.text();
      console.error(`[Cron Sync] Gagal mem-parse JSON response. Raw output: ${rawText}`);
      process.exit(1);
    }

    if (!response.ok || !result.success) {
      console.error(`[Cron Sync] Sinkronisasi GAGAL!`);
      console.error(`[Cron Sync] Error detail:`, JSON.stringify(result, null, 2));
      process.exit(1);
    }

    console.log(`[Cron Sync] Sinkronisasi BERHASIL!`);
    console.log(`[Cron Sync] Hasil Google Sheets:`, result.data?.sheets?.message || 'Tidak ada pesan');
    if (result.data?.sheets?.error) {
      console.warn(`[Cron Sync] Warning Sheets: ${result.data.sheets.error}`);
    }
    console.log(`[Cron Sync] Hasil Odoo Cloud:`, result.data?.odoo?.message || 'Tidak ada pesan');
    if (result.data?.odoo?.error) {
      console.warn(`[Cron Sync] Warning Odoo: ${result.data.odoo.error}`);
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error(`[Cron Sync] Error koneksi ke server Next.js:`, error.message || error);
    process.exit(1);
  }
}

main();
