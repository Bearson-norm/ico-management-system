import fs from 'fs';
import path from 'path';
import {
  describeAuditScheduleForToday,
  shouldRunAuditGenerateToday,
} from '../lib/ga/auditSchedule';
import { getJakartaYmd } from '../lib/ga/jakartaDate';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;
    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnv();

  const { y, m, d } = getJakartaYmd();
  const scheduleDesc = describeAuditScheduleForToday();

  if (!shouldRunAuditGenerateToday()) {
    console.log(
      `[Cron Audit GA] Skip: ${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} WIB bukan jadwal audit (target: ${scheduleDesc}).`
    );
    process.exit(0);
  }

  const host = process.env.HOST || '127.0.0.1';
  const port = process.env.PORT || '1325';
  const cronToken = process.env.CRON_TOKEN;

  if (!cronToken) {
    console.error('[Cron Audit GA] Error: CRON_TOKEN tidak ditemukan di environment / .env');
    process.exit(1);
  }

  const url = `http://${host}:${port}/api/ga/audit/generate`;
  console.log(`[Cron Audit GA] Jadwal audit terdeteksi (${scheduleDesc}). Memanggil ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronToken}`,
      },
      body: JSON.stringify({ source: 'cron' }),
    });

    console.log(`[Cron Audit GA] HTTP Status: ${response.status}`);
    let result: { success?: boolean; error?: string; data?: unknown };
    try {
      result = await response.json();
    } catch {
      const raw = await response.text();
      console.error('[Cron Audit GA] Gagal parse JSON:', raw);
      process.exit(1);
    }

    if (response.status === 409) {
      console.log('[Cron Audit GA] Snapshot periode sudah ada (idempotent OK).', result.error || '');
      process.exit(0);
    }

    if (!response.ok || !result.success) {
      console.error('[Cron Audit GA] GAGAL:', JSON.stringify(result, null, 2));
      process.exit(1);
    }

    console.log('[Cron Audit GA] BERHASIL:', JSON.stringify(result.data, null, 2));
    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Cron Audit GA] Error koneksi:', msg);
    process.exit(1);
  }
}

main();
