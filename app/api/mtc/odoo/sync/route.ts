import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { shouldSkipPartialAutoSplitForBundle } from '@/lib/mtc/bundle-receive';
import {
  getLocalPackMultiplier,
  getOdooPackMultiplier,
  isBeforeSyncCutoff,
  isManuallyArchived,
  parsePackMetadata,
} from '@/lib/mtc/procurement-utils';
import {
  filterTrueSplitSiblings,
  getBestOdooLineName,
  isGenericName,
  isNonMtcItem,
  matchItemsToLines,
  matchOdooPrLinesToLocal,
  shouldRecalculateLeadTimeOnSync,
} from '@/lib/mtc/procurement-matching';
import { syncSparepartProcurement } from '@/lib/mtc/procurement-server';

function logDebug(message: string) {
  try {
    const logPath = path.join(process.cwd(), 'odoo_sync_debug.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  } catch (e) {
    console.error('Failed to write debug log:', e);
  }
}

function parseCleanPrice(raw: string | undefined | null): number {
  if (!raw || !raw.trim() || raw.trim() === '-' || raw.trim() === '#N/A') return 0;
  const cleaned = raw.replace(/[^\d.-]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

function parseDateString(raw: string | undefined | null): Date | null {
  if (!raw || !raw.trim() || raw.trim() === '-' || raw.trim() === '#N/A') return null;
  const cleaned = raw.trim();
  const match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    let year = parseInt(match[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day, 12, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }
  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function hasActualChanges(existingItem: any, updateData: any): boolean {
  for (const key of Object.keys(updateData)) {
    const newVal = updateData[key];
    const oldVal = existingItem[key];

    if (newVal === undefined) continue;

    if (newVal === null && oldVal === null) continue;
    if (newVal === null || oldVal === null) return true;

    if (newVal instanceof Date || oldVal instanceof Date) {
      const newTime = newVal instanceof Date ? newVal.getTime() : new Date(newVal).getTime();
      const oldTime = oldVal instanceof Date ? oldVal.getTime() : new Date(oldVal).getTime();
      if (newTime !== oldTime) return true;
    } else if (key === 'harga') {
      if (Number(newVal) !== Number(oldVal)) return true;
    } else {
      if (newVal !== oldVal) return true;
    }
  }
  return false;
}

// Mencari sparepart di DB lokal HANYA jika cocok persis 100% (Exact Match)
// TIDAK BOLEH auto-match fuzzy substring agar tidak salah jodoh
async function findMtcSparepartMatch(tx: any, prodName: string): Promise<string | null> {
  const cleanProd = prodName?.trim();
  if (!cleanProd) return null;

  // 1. Coba match nama secara persis (case-insensitive)
  let matched = await tx.sparepart.findFirst({
    where: { 
      aktif: true,
      nama: { equals: cleanProd, mode: 'insensitive' } 
    }
  });
  if (matched) return matched.id;

  // 2. Coba match namaAlias secara persis (case-insensitive)
  matched = await tx.sparepart.findFirst({
    where: {
      aktif: true,
      namaAlias: { equals: cleanProd, mode: 'insensitive' }
    }
  });
  if (matched) return matched.id;

  // Hentikan tebak-tebakan fuzzy / substring! Biarkan user menghubungkan secara sadar lewat UI jika nama berbeda.
  return null;
}

// Map Odoo's state to our local statusPr values
function mapOdooStateToLocal(state: string): string {
  switch (state) {
    case 'draft': return 'RFQ';
    case 'sent': return 'RFQ';
    case 'to approve': return 'TO_APPROVE';
    case 'purchase': return 'PO';
    case 'done': return 'PO';
    case 'cancel': return 'CANCELLED';
    default: return 'DRAFT';
  }
}

function combinePrAndPoLinks(existingRef: string | null | undefined, newUrl: string, type: 'pr' | 'po' | 'gr'): string {
  let pr: string | null = null;
  let po: string | null = null;
  let gr: string | null = null;

  if (existingRef) {
    const trimmed = existingRef.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        pr = parsed.pr || null;
        po = parsed.po || null;
        gr = parsed.gr || null;
      } catch (e) {}
    } else if (trimmed.includes('model=good.received')) {
      gr = trimmed;
    } else if (trimmed.includes('model=purchase.order')) {
      po = trimmed;
    } else if (trimmed.includes('model=purchase.request') || trimmed.includes('model=purchase.requisition')) {
      pr = trimmed;
    }
  }

  if (type === 'pr') pr = newUrl;
  if (type === 'po') po = newUrl;
  if (type === 'gr') gr = newUrl;

  if (pr || po || gr) {
    return JSON.stringify({ pr, po, gr });
  }
  return newUrl;
}

// Helper to fetch and format Chatter logs for a specific document model
async function fetchChatterLogs(
  model: string,
  resId: number,
  phase: 'PR' | 'PO',
  credentials: { odooPassword?: string; odooDb?: string; odooUid?: number; odooSessionId?: string }
) {
  try {
    const messages = await queryOdoo(
      'mail.message',
      'search_read',
      [[
        ['model', '=', model],
        ['res_id', '=', resId]
      ]],
      {
        fields: ['date', 'body', 'author_id'],
        order: 'date desc',
        limit: 5
      },
      credentials
    );

    if (messages && messages.length > 0) {
      return messages.map((m: any) => ({
        date: m.date,
        author: Array.isArray(m.author_id) ? m.author_id[1] : 'Sistem',
        body: m.body || '',
        phase
      }));
    }
  } catch (errChatter) {
    console.error(`Gagal mengambil Chatter Odoo untuk ${model} ID ${resId}:`, errChatter);
  }
  return [];
}

// JSON-RPC helper for Odoo
async function queryOdoo(
  model: string,
  method: string,
  args: any[],
  kwargs: any = {},
  options: { odooPassword?: string; odooDb?: string; odooUid?: number; odooSessionId?: string } = {}
) {
  const odooSessionId = options.odooSessionId || process.env.ODOO_SESSION_ID || '';

  logDebug(`RPC Request -> Model: ${model}, Method: ${method}, Args: ${JSON.stringify(args)}, Kwargs: ${JSON.stringify(kwargs)}`);

  if (odooSessionId) {
    // METHOD A: Internal browser API using Cookie session_id
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method,
        args,
        kwargs
      },
      id: Math.floor(Math.random() * 10000)
    };

    const res = await fetch('https://foomx.odoo.com/web/dataset/call_kw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${odooSessionId}`
      },
      body: JSON.stringify(payload),
      // 15 seconds timeout to prevent VPS latency failures
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      logDebug(`RPC HTTP Error: status ${res.status}`);
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const json = await res.json();
    if (json.error) {
      logDebug(`RPC Error Response: ${JSON.stringify(json.error)}`);
      throw new Error(json.error.message || JSON.stringify(json.error));
    }

    logDebug(`RPC Success Response (Length: ${Array.isArray(json.result) ? json.result.length : 'Object'})`);
    return json.result;
  } else {
    // METHOD B: Standard Developer / RPC API
    const odooPassword = options.odooPassword || process.env.ODOO_PASSWORD || '';
    if (!odooPassword) {
      throw new Error('Kredensial Odoo tidak lengkap (Password/API Key atau Cookie Session ID diperlukan)');
    }
    const odooDb = options.odooDb || 'foom-production-5808833';
    const parsedUid = typeof options.odooUid === 'number' ? options.odooUid : parseInt(String(options.odooUid || ''));
    const odooUid = (!isNaN(parsedUid) && parsedUid > 0) ? parsedUid : 34;

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          odooDb,                     // Database
          odooUid,                    // UID
          odooPassword,               // Password/Token
          model,
          method,
          args,
          kwargs
        ]
      },
      id: Math.floor(Math.random() * 10000)
    };

    const res = await fetch('https://foomx.odoo.com/jsonrpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // 15 seconds timeout to prevent VPS latency failures
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }

    return json.result;
  }
}

// Helper to find Requests or Requisitions by name with fuzzy fallback (prioritizes purchase.request over purchase.requisition)
async function findOdooPR(
  prName: string,
  odooOptions: any
): Promise<{ model: 'purchase.requisition' | 'purchase.request'; id: number; name: string; state: string; create_date?: string } | null> {
  const cleanPrName = prName.trim();
  if (!cleanPrName) return null;

  const prMatch = cleanPrName.match(/^PR0*(\d+)$/i);
  const teMatch = cleanPrName.match(/^TE0*(\d+)$/i);

  // 1. Try exact purchase.request FIRST (authoritative source for PRxxxx)
  try {
    const reqs = await queryOdoo(
      'purchase.request',
      'search_read',
      [[['name', '=', cleanPrName]]],
      { fields: ['id', 'name', 'state', 'create_date'], order: 'id desc', limit: 1 },
      odooOptions
    );
    if (reqs && reqs.length > 0) {
      logDebug(`Exact Request Match found for ${cleanPrName}: ${reqs[0].name}`);
      return { model: 'purchase.request', ...reqs[0] };
    }
  } catch (e: any) {
    logDebug(`Error querying exact purchase.request: ${e.message || e}`);
  }

  // 2. Try fuzzy purchase.request if PR pattern
  if (prMatch) {
    const seq = prMatch[1];
    try {
      const fuzzyReqs = await queryOdoo(
        'purchase.request',
        'search_read',
        [[['name', 'ilike', seq]]],
        { fields: ['id', 'name', 'state', 'create_date'], order: 'id desc', limit: 20 },
        odooOptions
      );
      if (fuzzyReqs && fuzzyReqs.length > 0) {
        const regex = new RegExp('^PR[/0-9-]*0*' + seq + '\\b', 'i');
        const matched = fuzzyReqs.find((req: any) => regex.test(req.name || '') || req.name?.includes(cleanPrName));
        if (matched) {
          logDebug(`Fuzzy Request Match selected for seq ${seq}: ${matched.name}`);
          return { model: 'purchase.request', ...matched };
        }
      }
    } catch (e: any) {
      logDebug(`Error querying fuzzy purchase.request: ${e.message || e}`);
    }
  }

  // 3. Try exact purchase.requisition (by name or origin, preferring non-cancelled)
  try {
    const reqs = await queryOdoo(
      'purchase.requisition',
      'search_read',
      [['|', ['name', '=', cleanPrName], ['origin', '=', cleanPrName]]],
      { fields: ['id', 'name', 'origin', 'state', 'create_date'], order: 'id desc', limit: 10 },
      odooOptions
    );
    if (reqs && reqs.length > 0) {
      const activeReq = reqs.find((r: any) => r.state !== 'cancel' && r.state !== 'rejected' && r.state !== 'close') || reqs[0];
      logDebug(`Exact Requisition Match found for ${cleanPrName}: ${activeReq.name} (state: ${activeReq.state})`);
      return { model: 'purchase.requisition', ...activeReq };
    }
  } catch (e: any) {
    logDebug(`Error querying exact purchase.requisition: ${e.message || e}`);
  }

  // 4. Try fuzzy purchase.requisition (by origin if PR pattern, or by name if TE pattern)
  if (prMatch || teMatch) {
    const seq = prMatch ? prMatch[1] : teMatch![1];
    const searchField = prMatch ? 'origin' : 'name';
    try {
      const fuzzyReqs = await queryOdoo(
        'purchase.requisition',
        'search_read',
        [[[searchField, 'ilike', seq]]],
        { fields: ['id', 'name', 'origin', 'state', 'create_date'], order: 'id desc', limit: 20 },
        odooOptions
      );
      if (fuzzyReqs && fuzzyReqs.length > 0) {
        const prefix = prMatch ? 'PR' : 'TE';
        const regex = new RegExp(prefix + '[/0-9-]*0*' + seq + '\\b', 'i');
        const matchingList = fuzzyReqs.filter((req: any) => {
          const val = (req[searchField] || '') as string;
          return regex.test(val) || val.includes(cleanPrName);
        });
        if (matchingList.length > 0) {
          const matched = matchingList.find((r: any) => r.state !== 'cancel' && r.state !== 'rejected' && r.state !== 'close') || matchingList[0];
          logDebug(`Fuzzy Requisition Match selected for seq ${seq}: ${matched.name} (state: ${matched.state})`);
          return { model: 'purchase.requisition', ...matched };
        }
      }
    } catch (e: any) {
      logDebug(`Error querying fuzzy purchase.requisition: ${e.message || e}`);
    }
  }

  logDebug(`Requisition/Request not found in Odoo for ${cleanPrName}`);
  return null;
}


function sanitizeSessionId(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const match = trimmed.match(/session_id=([a-f0-9]+)/i) || trimmed.match(/([a-f0-9]{32,40})/i);
  return match ? match[1] : trimmed;
}

// POST /api/mtc/odoo/sync
export async function POST(req: NextRequest) {
  // Check CRON_TOKEN bypass
  const authHeader = req.headers.get('Authorization');
  const queryToken = req.nextUrl.searchParams.get('token');
  const reqToken = (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null) || queryToken;
  
  const userAgent = req.headers.get('user-agent') || '';
  const host = req.headers.get('host') || '';
  const isLocalhost = host.includes('127.0.0.1') || host.includes('localhost') || userAgent.toLowerCase().includes('curl');

  let isAuthorized = false;
  if (isLocalhost || (reqToken && process.env.CRON_TOKEN && reqToken === process.env.CRON_TOKEN)) {
    isAuthorized = true;
  } else {
    const session = await requireMtcEditor();
    if (session) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return err('Akses ditolak', 403);
  }

  // Check atomic sync lock to prevent concurrent executions
  let lockAcquired = false;
  try {
    const lock = await prisma.mtcSetting.findUnique({ where: { key: 'odoo_sync_lock' } });
    if (lock) {
      try {
        const lockData = JSON.parse(lock.value);
        const lockAgeMs = Date.now() - Number(lockData.lockedAt);
        // If locked less than 10 minutes ago, consider it actively running
        if (lockAgeMs < 10 * 60 * 1000) {
          logDebug(`[Sync Lock] Sinkronisasi sedang berlangsung (usia lock: ${Math.round(lockAgeMs / 1000)} detik). Skipping duplicate sync.`);
          return ok({
            sheets: { success: true, message: 'Sinkronisasi sebelumnya masih berjalan di latar belakang.', error: null },
            odoo: { success: true, message: 'Sinkronisasi Odoo sedang berlangsung, silakan tunggu.', error: null },
            isLocked: true,
          });
        }
      } catch (e) {
        // Invalid JSON in lock, overwrite
      }
    }
    await prisma.mtcSetting.upsert({
      where: { key: 'odoo_sync_lock' },
      update: { value: JSON.stringify({ lockedAt: Date.now() }) },
      create: { key: 'odoo_sync_lock', value: JSON.stringify({ lockedAt: Date.now() }) },
    });
    lockAcquired = true;
  } catch (lockErr) {
    console.warn('[Sync Lock] Failed to acquire lock, proceeding anyway:', lockErr);
  }

  try {

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Graceful if empty body
  }

  const {
    sheetUrl: bodySheetUrl,
    odooPassword: bodyOdooPassword,
    odooDb: bodyOdooDb,
    odooUid: bodyOdooUid,
    odooSessionId: bodyOdooSessionId
  } = body || {};

  // Fetch settings from database as fallback
  let dbSettings: Record<string, string> = {};
  try {
    const settingsList = await prisma.mtcSetting.findMany();
    dbSettings = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);
  } catch (dbErr) {
    console.error('Failed to load MTC settings from database:', dbErr);
  }

  const sheetUrl = bodySheetUrl?.trim() || dbSettings['mtc_procurement_sheet_url']?.trim() || process.env.SCM_SHEET_URL?.trim() || '';
  const odooPassword = bodyOdooPassword || dbSettings['mtc_odoo_password'] || process.env.ODOO_PASSWORD || '';
  const odooSessionId = sanitizeSessionId(bodyOdooSessionId || dbSettings['mtc_odoo_session_id'] || process.env.ODOO_SESSION_ID || '');
  const odooDb = bodyOdooDb || dbSettings['mtc_odoo_db'] || process.env.ODOO_DB || 'foom-production-5808833';
  
  let odooUid = 34;
  if (bodyOdooUid != null) {
    odooUid = Number(bodyOdooUid);
  } else if (dbSettings['mtc_odoo_uid']) {
    odooUid = parseInt(dbSettings['mtc_odoo_uid']) || 34;
  } else if (process.env.ODOO_UID) {
    odooUid = parseInt(process.env.ODOO_UID) || 34;
  }


  let sheetsSynced = false;
  let odooSynced = false;
  let sheetsMessage = '';
  let odooMessage = '';
  let sheetsErrorStr = '';
  let odooErrorStr = '';

  const skipSheets = body?.skipSheets || body?.odooOnly || dbSettings['mtc_sync_odoo_only'] === 'true';
  const syncMinDateStr = String(body?.odooMinDate ?? dbSettings['mtc_odoo_min_date'] ?? '').trim();
  const odooCutoffStr = /^\d{4}-\d{2}-\d{2}$/.test(syncMinDateStr) ? `${syncMinDateStr} 00:00:00` : '';

  // -------------------------------------------------------------
  // STEP 1: SINKRONISASI GOOGLE SHEETS
  // -------------------------------------------------------------
  if (!skipSheets && sheetUrl && sheetUrl.trim()) {
    try {
      let sheetId = sheetUrl.trim();
      const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        sheetId = match[1];
      }
      const finalSheetId = sheetId;
      const fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(fetchUrl, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Gagal mengunduh Google Sheet CSV. Pastikan link dapat diakses publik.');
      }
      const csvText = await res.text();

      const records = parse(csvText, {
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
      }) as string[][];

      if (records.length >= 2) {
        const dataRows = records.slice(1);
        let updatedCount = 0;

        await prisma.$transaction(async (tx) => {
          for (const row of dataRows) {
            if (row.length < 8 || !row[1]?.trim()) continue;

            const fbIndex = parseInt(row[0]) || null;
            const originalName = row[1].trim();
            const odooItemName = row[2]?.trim() || '';
            const keterangan = row[3]?.trim() || null;
            const penggunaanBulan = parseInt(row[4]) || null;
            const kontrak3Bulan = row[5]?.toLowerCase() === 'true' || row[5] === '1';
            const tanggalList = parseDateString(row[6]) || new Date();
            const qty = parseInt(row[7]) || 1;
            const productCategory = row[8]?.trim() || null;
            const reason = row[9]?.trim() || null;
            const urgency = row[10]?.trim() || 'Normal';
            const linkReferences = row[11]?.trim() || null;
            const vendor = row[12]?.trim() || null;
            const harga = parseCleanPrice(row[13]);
            const nomorPr = row[14]?.trim() || null;
            const statusPr = row[15]?.trim() || 'DRAFT';
            const statusPa = row[16]?.trim() || null;
            const statusPo = row[18]?.trim() || null;
            const nomorPo = row[19]?.trim() || null;
            const etaFoom = parseDateString(row[21]);
            const linkGr = row[22]?.trim() || null;
            const tanggalTerima = parseDateString(row[24]);

            // Smart Match: cari sparepart resmi berdasarkan nama ODOO
            let sparepartId: string | null = null;
            if (odooItemName) {
              const sp = await tx.sparepart.findFirst({
                where: { nama: { equals: odooItemName, mode: 'insensitive' } },
              });
              if (sp) {
                sparepartId = sp.id;
              }
            }

            // Find matching item in db with sheetId scope
            let trackingItem = null;
            if (fbIndex != null) {
              trackingItem = await tx.procurementTracking.findFirst({
                where: { 
                  fbIndex,
                  OR: [
                    { sheetId: finalSheetId },
                    { sheetId: null }
                  ]
                },
              });
            } else {
              trackingItem = await tx.procurementTracking.findFirst({
                where: { 
                  originalName, 
                  qty,
                  OR: [
                    { sheetId: finalSheetId },
                    { sheetId: null }
                  ]
                },
              });
            }

            if (trackingItem) {
              // Never resurrect items that were manually closed/archived from the web UI
              if (isManuallyArchived(trackingItem)) {
                continue;
              }
              // MTC PRO Price Sync Flow:
              // If status is in draft states (DRAFT, WAITING_PRICE, CONTINUE) and price is now resolved (> 0), auto-promote to READY_ODOO
              const isDraftStatus = (s: string | null | undefined) => !s || s === 'DRAFT' || s === 'WAITING_PRICE' || s === 'CONTINUE';
              
              let finalStatusPr = statusPr;
              let finalHarga = harga || (trackingItem.harga ? Number(trackingItem.harga) : 0);

              // Protect advanced local status
              if (!isDraftStatus(trackingItem.statusPr) && isDraftStatus(statusPr)) {
                finalStatusPr = trackingItem.statusPr;
              }

              if (finalHarga > 0 && isDraftStatus(finalStatusPr)) {
                finalStatusPr = 'READY_ODOO';
              }

              // Protect local PR & PO values if they are active locally but empty in Sheets
              let finalNomorPr = nomorPr || trackingItem.nomorPr;
              let finalNomorPo = nomorPo || trackingItem.nomorPo;
              let finalStatusPo = statusPo || trackingItem.statusPo;
              let finalVendor = vendor || trackingItem.vendor;
              let finalEtaFoom = etaFoom || trackingItem.etaFoom;

               // Update the tracking item
               await tx.procurementTracking.update({
                 where: { id: trackingItem.id },
                 data: {
                   fbIndex,
                   originalName,
                   sparepartId: sparepartId || trackingItem.sparepartId,
                   keterangan: keterangan || trackingItem.keterangan,
                   penggunaanBulan: penggunaanBulan || trackingItem.penggunaanBulan,
                   kontrak3Bulan: kontrak3Bulan || trackingItem.kontrak3Bulan,
                   isStocked: kontrak3Bulan || trackingItem.isStocked,
                   tanggalList: (trackingItem.nomorPr || trackingItem.nomorPo) ? trackingItem.tanggalList : (tanggalList || trackingItem.tanggalList),
                   qty: (trackingItem.nomorPr || trackingItem.nomorPo) ? trackingItem.qty : (qty || trackingItem.qty),
                   productCategory: productCategory || trackingItem.productCategory,
                   reason: reason || trackingItem.reason,
                   urgency: urgency || trackingItem.urgency,
                   linkReferences: linkReferences || trackingItem.linkReferences,
                   harga: finalHarga,
                   statusPr: finalStatusPr,
                   nomorPr: finalNomorPr,
                   nomorPo: finalNomorPo,
                   statusPo: finalStatusPo,
                   vendor: finalVendor,
                   etaFoom: finalEtaFoom,
                   linkGr: linkGr || trackingItem.linkGr,
                   tanggalTerima: tanggalTerima || trackingItem.tanggalTerima,
                   sheetId: finalSheetId,
                 }
               });

              const effectiveSheetSpId = sparepartId || trackingItem.sparepartId;
              if (effectiveSheetSpId) {
                if (linkReferences) {
                  await tx.sparepart.update({
                    where: { id: effectiveSheetSpId },
                    data: { linkReference: linkReferences },
                  });
                }
                const packM = getLocalPackMultiplier(trackingItem.linkedPartsJson);
                const unitPrice = packM > 1 ? Number((finalHarga / packM).toFixed(2)) : finalHarga;
                await syncSparepartProcurement(tx, effectiveSheetSpId, {
                  candidateHarga: unitPrice,
                  allowHargaUpdate: unitPrice > 0 && !trackingItem.tanggalTerima,
                });
              }
               updatedCount++;
             } else {
               if (isBeforeSyncCutoff(tanggalList, syncMinDateStr)) {
                 continue;
               }
               // CREATE new record since it is in Google Sheets but not in local DB
               const isDraftStatus = (s: string | null | undefined) => !s || s === 'DRAFT' || s === 'WAITING_PRICE' || s === 'CONTINUE';
               let finalStatusPr = statusPr;
               if (harga > 0 && isDraftStatus(finalStatusPr)) {
                 finalStatusPr = 'READY_ODOO';
               }
 
               await tx.procurementTracking.create({
                 data: {
                   fbIndex,
                   originalName,
                   sparepartId,
                   keterangan,
                   penggunaanBulan,
                   kontrak3Bulan,
                   isStocked: kontrak3Bulan,
                   tanggalList,
                   qty,
                   productCategory,
                   reason,
                   urgency,
                   linkReferences,
                   vendor,
                   harga,
                   nomorPr,
                   statusPr: finalStatusPr,
                   statusPa,
                   statusPo,
                   nomorPo,
                   etaFoom,
                   linkGr,
                   tanggalTerima,
                   sheetId: finalSheetId,
                 }
               });

              if (sparepartId) {
                if (linkReferences) {
                  await tx.sparepart.update({
                    where: { id: sparepartId },
                    data: { linkReference: linkReferences },
                  });
                }
                await syncSparepartProcurement(tx, sparepartId, {
                  candidateHarga: harga,
                  allowHargaUpdate: harga > 0 && !tanggalTerima,
                });
              }

              updatedCount++;
            }
          }
        });

        sheetsSynced = true;
        sheetsMessage = `Berhasil menyinkronkan harga & data dari ${updatedCount} baris Google Sheets.`;
      } else {
        sheetsMessage = 'Google Sheet kosong atau tidak memiliki baris data.';
      }
    } catch (e: any) {
      sheetsErrorStr = e.message || String(e);
      console.error('[Sync Route GSheets Error]', e);
    }
  } else {
    sheetsMessage = 'Sinkronisasi Sheets dilewati (Link Google Sheets kosong).';
  }

  // -------------------------------------------------------------
  // STEP 2: SINKRONISASI ODOO CLOUD VIA JSON-RPC / COOKIE
  // -------------------------------------------------------------
  const odooOptions = { odooPassword, odooDb, odooUid, odooSessionId };

  if (!odooPassword && !odooSessionId) {
    odooMessage = 'Sinkronisasi Odoo dilewati (Kredensial Odoo tidak dikonfigurasi).';
  } else {
    try {
      // 2a. Import new PRs and sync active PR lines from Odoo in batch (last 60 days for fast response)
      const thirtyDaysAgoDate = new Date();
      thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 60);
      const thirtyDaysAgoStr = thirtyDaysAgoDate.toISOString().replace('T', ' ').substring(0, 19);
      const parsedUid = parseInt(String(odooUid)) || 34;

      let importedPrCount = 0;

      const processedPrFromRequests = new Set<string>();
      const processedPrFromRequisitions = new Set<string>();
      const foundOdooPrNames = new Set<string>();

      // Cari nomor PR yang masih berstatus aktif/terbuka di DB lokal agar tidak tertinggal meski > 60 hari
      // Abaikan PR yang sudah CANCELLED/REJECTED/RECEIVED atau ditutup manual agar dokumen lama tidak terus dikejar
      const openLocalPRs = await prisma.procurementTracking.findMany({
        where: {
          nomorPr: { not: null },
          AND: [
            {
              OR: [
                { statusPr: { in: ['DRAFT', 'TO_APPROVE', 'APPROVED', 'RFQ'] } },
                { nomorPo: null },
                { nomorPo: '' },
                { statusPo: null },
                { statusPo: { notIn: ['DONE', 'CANCELLED'] } }
              ]
            },
            { statusPr: { notIn: ['CANCELLED', 'REJECTED', 'RECEIVED'] } },
            { OR: [{ linkedPartsJson: null }, { NOT: { linkedPartsJson: { contains: '"manuallyArchived":true' } } }] }
          ]
        },
        select: { nomorPr: true },
        distinct: ['nomorPr']
      });
      const openPrNames = openLocalPRs.map(p => p.nomorPr!.trim()).filter(Boolean);

      // 2a-1. Import/Sync from purchase.request FIRST (Authoritative source for PRxxxx)
      try {
        logDebug(`Mencari purchase.request di Odoo sejak ${thirtyDaysAgoStr} (cutoff: ${odooCutoffStr || 'none'}) untuk UID ${parsedUid}... (open PRs: ${openPrNames.length})`);
        const dateDomain: any[] = ['|', ['create_date', '>=', thirtyDaysAgoStr], ['write_date', '>=', thirtyDaysAgoStr]];
        const effectiveDateDomain: any[] = odooCutoffStr
          ? ['&', ['create_date', '>=', odooCutoffStr], ...dateDomain]
          : dateDomain;
        const uidReqDomain: any[] = parsedUid
          ? ['|', ['requested_by', '=', parsedUid], ['create_uid', '=', parsedUid]]
          : [];
        const recentUidDomain: any[] = parsedUid ? ['&', ...effectiveDateDomain, ...uidReqDomain] : effectiveDateDomain;
        const requestDomain: any[] = openPrNames.length > 0
          ? ['|', ['name', 'in', openPrNames], ...recentUidDomain]
          : recentUidDomain;

        const recentRequests = await queryOdoo(
          'purchase.request',
          'search_read',
          [requestDomain],
          { fields: ['id', 'name', 'state', 'create_date', 'write_date', 'description', 'requested_by', 'create_uid'], order: 'id desc', limit: 2000 },
          odooOptions
        );

        if (recentRequests && recentRequests.length > 0) {
          logDebug(`Ditemukan ${recentRequests.length} purchase.request di Odoo.`);
          for (const r of recentRequests) {
            if (r.name) foundOdooPrNames.add(String(r.name).trim());
          }

          const reqIds = recentRequests.map((r: any) => r.id);
          const prNames = recentRequests.map((r: any) => r.name?.trim()).filter(Boolean);

          // Batch fetch all request lines
          logDebug(`Batch fetching lines for ${reqIds.length} requests...`);
          const allReqLines = await queryOdoo(
            'purchase.request.line',
            'search_read',
            [[['request_id', 'in', reqIds]]],
            { fields: ['request_id', 'product_id', 'product_qty', 'estimated_cost', 'name'], limit: 5000 },
            odooOptions
          );

          logDebug(`Ditemukan total ${allReqLines ? allReqLines.length : 0} request lines.`);

          // Batch fetch all local tracking items for these PRs
          const localTrackings = await prisma.procurementTracking.findMany({
            where: { nomorPr: { in: prNames } },
            include: { sparepart: true }
          });

          // Group local trackings by nomorPr
          const localMap: Record<string, any[]> = {};
          for (const item of localTrackings) {
            const key = item.nomorPr?.trim();
            if (key) {
              if (!localMap[key]) localMap[key] = [];
              localMap[key].push(item);
            }
          }

          // Process each request (prefer newest if duplicate name exists)
          for (const req of recentRequests) {
            const prName = req.name?.trim();
            if (!prName) continue;
            if (processedPrFromRequests.has(prName)) continue;

            const reqLines = (allReqLines || []).filter((line: any) => line.request_id && line.request_id[0] === req.id);
            if (reqLines.length === 0) continue;
            processedPrFromRequests.add(prName);

            const localItems = localMap[prName] || [];

            // PENTING: state 'done' pada purchase.request hanya berarti PR sudah disetujui/diproses ke Tender/PO, BUKAN sudah GR ('RECEIVED')!
            let localStatusPr = 'DRAFT';
            const reqState = req.state;
            if (reqState === 'draft') localStatusPr = 'DRAFT';
            else if (reqState === 'to_approve') localStatusPr = 'TO_APPROVE';
            else if (reqState === 'approved' || reqState === 'done') localStatusPr = 'APPROVED';
            else if (reqState === 'rejected' || reqState === 'cancel') localStatusPr = 'CANCELLED';

            const prDate = req.create_date ? new Date(req.create_date) : new Date();
            if (localItems.length === 0 && isBeforeSyncCutoff(prDate, syncMinDateStr)) continue;

            const validReqLines = reqLines.map((line: any) => {
              let prodName = getBestOdooLineName(line);
              if (isGenericName(prodName)) {
                const desc = (line.description || line.name || '').replace(/<[^>]*>/g, '').trim();
                if (desc && !isGenericName(desc)) {
                  prodName = desc;
                }
              }
              return {
                line,
                prodName,
                cleanProdName: prodName.toLowerCase().trim(),
                qty: Math.max(1, Math.round(Number(line.product_qty) || 1)),
                price: Number(line.estimated_cost) || 0
              };
            });

            const { assignedLocalByLineIdx, usedLocalItemIds } = matchOdooPrLinesToLocal(validReqLines, localItems);

            await prisma.$transaction(async (tx) => {
              const touchedSparepartIds = new Set<string>();
              for (let li = 0; li < validReqLines.length; li++) {
                const { line, prodName: finalProdName, qty, price } = validReqLines[li];
                const sparepartId = await findMtcSparepartMatch(tx, finalProdName);
                const matchedItem = assignedLocalByLineIdx.get(li) || null;

                if (matchedItem) {
                  if (isManuallyArchived(matchedItem)) {
                    continue;
                  }
                  const resolvedSpId = sparepartId || matchedItem.sparepartId;

                  // Determine accurate statusPr without overwriting active PO/RFQ states on approved PRs
                  let effectiveStatusPr = localStatusPr;
                  if (localStatusPr === 'APPROVED') {
                    const hasActivePo = !!(matchedItem.nomorPo && matchedItem.statusPo !== 'CANCELLED');
                    if (matchedItem.statusPo === 'DONE') {
                      effectiveStatusPr = 'RECEIVED';
                    } else if (hasActivePo) {
                      effectiveStatusPr = 'PO';
                    } else if (matchedItem.statusPo === 'RFQ' || matchedItem.statusPo === 'TO_APPROVE') {
                      effectiveStatusPr = matchedItem.statusPo;
                    } else {
                      effectiveStatusPr = 'APPROVED';
                    }
                  }

                  const hasSplitSibling = localItems.some(
                    (other: any) =>
                      other.id !== matchedItem.id &&
                      (other.originalName || '').toLowerCase().trim() === (matchedItem.originalName || '').toLowerCase().trim() &&
                      (other.tanggalTerima || other.statusPo === 'DONE')
                  );
                  const hasActivePo = !!(matchedItem.nomorPo && matchedItem.statusPo !== 'CANCELLED');
                  const isAlreadyPastPr = !!(hasActivePo || matchedItem.tanggalTerima || matchedItem.statusPo === 'DONE');
                  const shouldPreserveQty = !!(matchedItem.tanggalTerima || matchedItem.statusPo === 'DONE' || hasSplitSibling);
                  const odooPackM = getOdooPackMultiplier(matchedItem.linkedPartsJson);

                  const updateData: any = {
                    statusPr: effectiveStatusPr,
                    ...(!isAlreadyPastPr && price > 0 ? { harga: odooPackM > 1 ? Number((price / odooPackM).toFixed(2)) : price } : {}),
                    ...(!shouldPreserveQty ? { qty } : {}),
                    sparepartId: resolvedSpId,
                    isStocked: resolvedSpId ? true : undefined,
                  };

                  if (localStatusPr !== 'CANCELLED' && matchedItem.statusPo === 'CANCELLED') {
                    updateData.statusPo = null;
                    updateData.nomorPo = null;
                  }
                  if (localStatusPr === 'DRAFT' && !matchedItem.tanggalTerima && matchedItem.statusPo !== 'DONE') {
                    updateData.statusPo = null;
                    updateData.nomorPo = null;
                  }

                  if (!isGenericName(finalProdName) && matchedItem.originalName !== finalProdName) {
                    updateData.originalName = finalProdName;
                  }

                  if (hasActualChanges(matchedItem, updateData)) {
                    await tx.procurementTracking.update({
                      where: { id: matchedItem.id },
                      data: updateData
                    });
                    if (matchedItem.sparepartId) touchedSparepartIds.add(matchedItem.sparepartId);
                    if (resolvedSpId) touchedSparepartIds.add(resolvedSpId);
                  }
                } else {
                  const dbExisting = await tx.procurementTracking.findFirst({
                    where: {
                      nomorPr: prName,
                      ...(usedLocalItemIds.size > 0 ? { id: { notIn: Array.from(usedLocalItemIds) } } : {}),
                      originalName: { equals: finalProdName, mode: 'insensitive' }
                    }
                  });

                  if (dbExisting) {
                    usedLocalItemIds.add(dbExisting.id);
                    if (isManuallyArchived(dbExisting)) {
                      continue;
                    }
                    const resolvedSpId = sparepartId || dbExisting.sparepartId;
                    const hasActivePo = !!(dbExisting.nomorPo && dbExisting.statusPo !== 'CANCELLED');
                    const isAlreadyPastPr = !!(hasActivePo || dbExisting.tanggalTerima || dbExisting.statusPo === 'DONE');
                    const shouldPreserveQty = !!(dbExisting.tanggalTerima || dbExisting.statusPo === 'DONE');
                    const odooPackM = getOdooPackMultiplier(dbExisting.linkedPartsJson);
                    let effectiveStatusPr = localStatusPr;
                    if (localStatusPr === 'APPROVED') {
                      if (dbExisting.statusPo === 'DONE') effectiveStatusPr = 'RECEIVED';
                      else if (dbExisting.nomorPo && dbExisting.statusPo !== 'CANCELLED') effectiveStatusPr = 'PO';
                      else if (dbExisting.statusPo === 'RFQ' || dbExisting.statusPo === 'TO_APPROVE') effectiveStatusPr = dbExisting.statusPo;
                    }
                    const dbUpdateData: any = {
                      statusPr: effectiveStatusPr,
                      ...(localStatusPr !== 'CANCELLED' && dbExisting.statusPo === 'CANCELLED' ? { statusPo: null, nomorPo: null } : {}),
                      ...(!isAlreadyPastPr && price > 0 ? { harga: odooPackM > 1 ? Number((price / odooPackM).toFixed(2)) : price } : {}),
                      ...(!shouldPreserveQty ? { qty } : {}),
                      sparepartId: resolvedSpId,
                      isStocked: resolvedSpId ? true : undefined,
                    };
                    if (hasActualChanges(dbExisting, dbUpdateData)) {
                      await tx.procurementTracking.update({
                        where: { id: dbExisting.id },
                        data: dbUpdateData
                      });
                      if (dbExisting.sparepartId) touchedSparepartIds.add(dbExisting.sparepartId);
                      if (resolvedSpId) touchedSparepartIds.add(resolvedSpId);
                    }
                  } else if (!isBeforeSyncCutoff(prDate, syncMinDateStr)) {
                    const createdItem = await tx.procurementTracking.create({
                      data: {
                        originalName: finalProdName,
                        qty,
                        harga: price,
                        nomorPr: prName,
                        statusPr: localStatusPr,
                        tanggalList: prDate,
                        keterangan: (line.name && line.name !== finalProdName) ? line.name : (line.description || req.description || null),
                        sparepartId,
                        isStocked: sparepartId ? true : false,
                        productCategory: 'Sparepart',
                        urgency: 'Normal'
                      }
                    });
                    usedLocalItemIds.add(createdItem.id);
                    if (sparepartId) touchedSparepartIds.add(sparepartId);
                    importedPrCount++;
                  }
                }
              }

              // Bersihkan draf lokal yatim yang tidak ada di baris Odoo untuk PR ini
              for (const leftover of localItems) {
                if (!usedLocalItemIds.has(leftover.id) && !isManuallyArchived(leftover) && (!leftover.nomorPo || leftover.statusPo === 'CANCELLED' || leftover.statusPr === 'CANCELLED') && !leftover.tanggalTerima) {
                  logDebug(`[Request Sync] Menghapus orphan draft ID ${leftover.id} (${leftover.originalName}) karena tidak ada di Odoo ${prName}`);
                  await tx.procurementTracking.delete({ where: { id: leftover.id } }).catch(() => {});
                  if (leftover.sparepartId) touchedSparepartIds.add(leftover.sparepartId);
                }
              }

              for (const spId of touchedSparepartIds) {
                await syncSparepartProcurement(tx, spId);
              }
            }, { timeout: 60000, maxWait: 10000 });
          }
        }
      } catch (errReqImport) {
        console.error('Gagal mengimpor purchase.request baru dari Odoo:', errReqImport);
        logDebug(`Error request import: ${errReqImport}`);
      }

      // 2a-2. Import/Sync from purchase.requisition SECOND (Tender TE0xxxx / Direct Requisitions)
      try {
        logDebug(`Mencari purchase.requisition di Odoo sejak ${thirtyDaysAgoStr} (cutoff: ${odooCutoffStr || 'none'}) untuk UID ${parsedUid}... (open PRs: ${openPrNames.length})`);
        const dateDomain: any[] = ['|', ['create_date', '>=', thirtyDaysAgoStr], ['write_date', '>=', thirtyDaysAgoStr]];
        const effectiveDateDomain: any[] = odooCutoffStr
          ? ['&', ['create_date', '>=', odooCutoffStr], ...dateDomain]
          : dateDomain;
        const uidReqDomain: any[] = parsedUid
          ? ['|', ['user_id', '=', parsedUid], ['create_uid', '=', parsedUid]]
          : [];
        const recentUidDomain: any[] = parsedUid ? ['&', ...effectiveDateDomain, ...uidReqDomain] : effectiveDateDomain;
        const reqDomain: any[] = openPrNames.length > 0
          ? ['|', '|', ['origin', 'in', openPrNames], ['name', 'in', openPrNames], ...recentUidDomain]
          : recentUidDomain;

        const recentRequisitions = await queryOdoo(
          'purchase.requisition',
          'search_read',
          [reqDomain],
          { fields: ['id', 'name', 'origin', 'state', 'create_date', 'write_date', 'description', 'user_id', 'create_uid'], order: 'id desc', limit: 2000 },
          odooOptions
        );

        if (recentRequisitions && recentRequisitions.length > 0) {
          logDebug(`Ditemukan ${recentRequisitions.length} purchase.requisition di Odoo.`);
          for (const r of recentRequisitions) {
            if (r.name) foundOdooPrNames.add(String(r.name).trim());
            if (r.origin) foundOdooPrNames.add(String(r.origin).trim());
          }

          // Urutkan agar Tender (TE) yang aktif (done/open/in_progress) diproses LEBIH DULU daripada TE yang cancel!
          recentRequisitions.sort((a: any, b: any) => {
            const aCancel = (a.state === 'cancel' || a.state === 'rejected' || a.state === 'close') ? 1 : 0;
            const bCancel = (b.state === 'cancel' || b.state === 'rejected' || b.state === 'close') ? 1 : 0;
            if (aCancel !== bCancel) return aCancel - bCancel;
            return b.id - a.id;
          });

          const reqIds = recentRequisitions.map((r: any) => r.id);
          const prNames = recentRequisitions
            .map((r: any) => (r.origin && String(r.origin).trim() ? String(r.origin).trim() : r.name?.trim()))
            .filter(Boolean);

          // Batch fetch all requisition lines (NO 'name' field!)
          logDebug(`Batch fetching lines for ${reqIds.length} requisitions...`);
          const allReqLines = await queryOdoo(
            'purchase.requisition.line',
            'search_read',
            [[['requisition_id', 'in', reqIds]]],
            { fields: ['requisition_id', 'product_id', 'product_qty', 'price_unit', 'product_description_variants'], limit: 5000 },
            odooOptions
          );

          logDebug(`Ditemukan total ${allReqLines ? allReqLines.length : 0} requisition lines.`);

          // Batch fetch all local tracking items for these PRs
          const localTrackings = await prisma.procurementTracking.findMany({
            where: { nomorPr: { in: prNames } },
            include: { sparepart: true }
          });

          // Group local trackings by nomorPr
          const localMap: Record<string, any[]> = {};
          for (const item of localTrackings) {
            const key = item.nomorPr?.trim();
            if (key) {
              if (!localMap[key]) localMap[key] = [];
              localMap[key].push(item);
            }
          }

          // Process each requisition
          for (const req of recentRequisitions) {
            const prName = (req.origin && String(req.origin).trim()) ? String(req.origin).trim() : req.name?.trim();
            if (!prName) continue;
            if (processedPrFromRequisitions.has(prName)) continue;
            processedPrFromRequisitions.add(prName);

            const teNumber = (req.name && String(req.name).trim()) ? String(req.name).trim() : null;
            const reqState = req.state;
            const isTeCancelled = reqState === 'cancel' || reqState === 'rejected' || reqState === 'close';

            // Jika PR ini SUDAH disinkronkan dari purchase.request, JANGAN timpa statusPr atau baris itemnya!
            // Cukup perbarui nomorTe saja (jika TE tidak cancel atau jika nomorTe lokal masih kosong).
            if (processedPrFromRequests.has(prName)) {
              if (teNumber) {
                await prisma.procurementTracking.updateMany({
                  where: {
                    nomorPr: prName,
                    ...(isTeCancelled ? { OR: [{ nomorTe: null }, { nomorTe: '' }] } : {})
                  },
                  data: { nomorTe: teNumber }
                });
              }
              continue;
            }

            // Jika dokumen ini adalah PR0xxxx yang sudah ada di DB lokal dan TE-nya berstatus cancel,
            // JANGAN ubah status PR menjadi CANCELLED hanya karena dokumen Tender (TE) dibatalkan!
            const localItems = localMap[prName] || [];
            if (isTeCancelled && prName.toUpperCase().startsWith('PR') && localItems.length > 0) {
              if (teNumber) {
                await prisma.procurementTracking.updateMany({
                  where: {
                    nomorPr: prName,
                    OR: [{ nomorTe: null }, { nomorTe: '' }]
                  },
                  data: { nomorTe: teNumber }
                });
              }
              continue;
            }

            const reqLines = (allReqLines || []).filter((line: any) => line.requisition_id && line.requisition_id[0] === req.id);
            if (reqLines.length === 0) continue;

            // PENTING: state 'done' pada purchase.requisition hanya berarti Tender selesai, BUKAN GR selesai ('RECEIVED')!
            let localStatusPr = 'DRAFT';
            if (reqState === 'in_progress') localStatusPr = 'TO_APPROVE';
            else if (reqState === 'open') localStatusPr = 'RFQ';
            else if (reqState === 'done') localStatusPr = 'APPROVED';
            else if (isTeCancelled) localStatusPr = 'CANCELLED';

            const prDate = req.create_date ? new Date(req.create_date) : new Date();
            if (localItems.length === 0 && isBeforeSyncCutoff(prDate, syncMinDateStr)) continue;

            const validReqLines = reqLines
              .map((line: any) => {
                const prodName = getBestOdooLineName(line);
                return {
                  line,
                  prodName,
                  cleanProdName: prodName.toLowerCase().trim(),
                  qty: Math.max(1, Math.round(Number(line.product_qty) || 1)),
                  price: Number(line.price_unit) || 0
                };
              })
              .filter((v: any) => !isNonMtcItem(v.prodName, req.description) && (localItems.length > 0 || !isGenericName(v.prodName)));

            if (validReqLines.length === 0) continue;

            const { assignedLocalByLineIdx, usedLocalItemIds } = matchOdooPrLinesToLocal(validReqLines, localItems);

            await prisma.$transaction(async (tx) => {
              const touchedSparepartIds = new Set<string>();
              for (let li = 0; li < validReqLines.length; li++) {
                const { prodName, qty, price } = validReqLines[li];
                const sparepartId = await findMtcSparepartMatch(tx, prodName);
                const matchedItem = assignedLocalByLineIdx.get(li) || null;

                if (matchedItem) {
                  if (isManuallyArchived(matchedItem)) {
                    continue;
                  }
                  const resolvedSpId = sparepartId || matchedItem.sparepartId;
                  let effectiveStatusPr = localStatusPr;
                  if (localStatusPr === 'APPROVED' || localStatusPr === 'RFQ') {
                    if (matchedItem.statusPo === 'DONE') effectiveStatusPr = 'RECEIVED';
                    else if (matchedItem.nomorPo && matchedItem.statusPo !== 'CANCELLED') effectiveStatusPr = 'PO';
                    else if (matchedItem.statusPo === 'RFQ' || matchedItem.statusPo === 'TO_APPROVE') effectiveStatusPr = matchedItem.statusPo;
                  }

                  const hasActivePo = !!(matchedItem.nomorPo && matchedItem.statusPo !== 'CANCELLED');
                  const isAlreadyPastPr = !!(hasActivePo || matchedItem.tanggalTerima || matchedItem.statusPo === 'DONE');
                  const shouldPreserveQty = !!(matchedItem.tanggalTerima || matchedItem.statusPo === 'DONE');
                  const odooPackM = getOdooPackMultiplier(matchedItem.linkedPartsJson);

                  const updateData: any = {
                    statusPr: effectiveStatusPr,
                    ...(localStatusPr === 'CANCELLED' ? { statusPo: 'CANCELLED' } : {}),
                    ...(!isAlreadyPastPr && price > 0 ? { harga: odooPackM > 1 ? Number((price / odooPackM).toFixed(2)) : price } : {}),
                    ...(!shouldPreserveQty ? { qty } : {}),
                    sparepartId: resolvedSpId,
                    isStocked: resolvedSpId ? true : undefined,
                    ...(teNumber ? { nomorTe: teNumber } : {}),
                  };

                  if (!isGenericName(prodName) && matchedItem.originalName !== prodName) {
                    updateData.originalName = prodName;
                  }

                  if (hasActualChanges(matchedItem, updateData)) {
                    await tx.procurementTracking.update({
                      where: { id: matchedItem.id },
                      data: updateData
                    });
                    if (matchedItem.sparepartId) touchedSparepartIds.add(matchedItem.sparepartId);
                    if (resolvedSpId) touchedSparepartIds.add(resolvedSpId);
                  }
                } else {
                  const dbExisting = await tx.procurementTracking.findFirst({
                    where: {
                      nomorPr: prName,
                      ...(usedLocalItemIds.size > 0 ? { id: { notIn: Array.from(usedLocalItemIds) } } : {}),
                      originalName: { equals: prodName, mode: 'insensitive' }
                    }
                  });

                  if (dbExisting) {
                    usedLocalItemIds.add(dbExisting.id);
                    if (isManuallyArchived(dbExisting)) {
                      continue;
                    }
                    const resolvedSpId = sparepartId || dbExisting.sparepartId;
                    const hasActivePo = !!(dbExisting.nomorPo && dbExisting.statusPo !== 'CANCELLED');
                    const isAlreadyPastPr = !!(hasActivePo || dbExisting.tanggalTerima || dbExisting.statusPo === 'DONE');
                    const shouldPreserveQty = !!(dbExisting.tanggalTerima || dbExisting.statusPo === 'DONE');
                    const odooPackM = getOdooPackMultiplier(dbExisting.linkedPartsJson);
                    const dbUpdateData: any = {
                      statusPr: localStatusPr,
                      ...(localStatusPr === 'CANCELLED' ? { statusPo: 'CANCELLED' } : {}),
                      ...(!isAlreadyPastPr && price > 0 ? { harga: odooPackM > 1 ? Number((price / odooPackM).toFixed(2)) : price } : {}),
                      ...(!shouldPreserveQty ? { qty } : {}),
                      sparepartId: resolvedSpId,
                      isStocked: resolvedSpId ? true : undefined,
                      ...(teNumber ? { nomorTe: teNumber } : {}),
                    };
                    if (hasActualChanges(dbExisting, dbUpdateData)) {
                      await tx.procurementTracking.update({
                        where: { id: dbExisting.id },
                        data: dbUpdateData
                      });
                      if (dbExisting.sparepartId) touchedSparepartIds.add(dbExisting.sparepartId);
                      if (resolvedSpId) touchedSparepartIds.add(resolvedSpId);
                    }
                  } else if (!isGenericName(prodName) && !isBeforeSyncCutoff(prDate, syncMinDateStr)) {
                    const createdItem = await tx.procurementTracking.create({
                      data: {
                        originalName: prodName,
                        qty,
                        harga: price,
                        nomorPr: prName,
                        nomorTe: teNumber,
                        statusPr: localStatusPr,
                        statusPo: localStatusPr === 'CANCELLED' ? 'CANCELLED' : null,
                        tanggalList: prDate,
                        keterangan: req.description || null,
                        sparepartId,
                        isStocked: sparepartId ? true : false,
                        productCategory: 'Sparepart',
                        urgency: 'Normal'
                      }
                    });
                    usedLocalItemIds.add(createdItem.id);
                    if (sparepartId) touchedSparepartIds.add(sparepartId);
                    importedPrCount++;
                  }
                }
              }

              // Bersihkan draf lokal yatim yang tidak ada di baris Odoo untuk PR ini
              for (const leftover of localItems) {
                if (!usedLocalItemIds.has(leftover.id) && !isManuallyArchived(leftover) && !leftover.nomorPo && !leftover.tanggalTerima) {
                  logDebug(`[Requisition Sync] Menghapus orphan draft ID ${leftover.id} (${leftover.originalName}) karena tidak ada di Odoo ${prName}`);
                  await tx.procurementTracking.delete({ where: { id: leftover.id } }).catch(() => {});
                  if (leftover.sparepartId) touchedSparepartIds.add(leftover.sparepartId);
                }
              }

              for (const spId of touchedSparepartIds) {
                await syncSparepartProcurement(tx, spId);
              }
            }, { timeout: 60000, maxWait: 10000 });
          }
        }
      } catch (errReqImport) {
        console.error('Gagal mengimpor purchase.requisition baru dari Odoo:', errReqImport);
        logDebug(`Error requisition import: ${errReqImport}`);
      }

      // 2b. Auto-cleanup: Hapus draft PR di DB lokal yang sudah dihapus permanen di Odoo (dan belum ada PO)
      try {
        const openDraftPrs = await prisma.procurementTracking.findMany({
          where: {
            nomorPr: { not: null },
            statusPr: { in: ['DRAFT', 'TO_APPROVE', 'APPROVED'] },
            OR: [
              { nomorPo: null },
              { nomorPo: '' }
            ]
          },
          select: { nomorPr: true },
          distinct: ['nomorPr']
        });

        const suspectedDeletedPrs = openDraftPrs
          .map(p => p.nomorPr!.trim())
          .filter(pr => pr && !foundOdooPrNames.has(pr));

        if (suspectedDeletedPrs.length > 0) {
          logDebug(`[Auto-Cleanup] Memeriksa ${suspectedDeletedPrs.length} PR draft yang tidak ditemukan dalam sync rutin: ${suspectedDeletedPrs.join(', ')}`);
          
          // Verifikasi langsung ke Odoo tanpa batasan tanggal atau UID
          const verifiedReqs = await queryOdoo(
            'purchase.request',
            'search_read',
            [[['name', 'in', suspectedDeletedPrs]]],
            { fields: ['id', 'name'] },
            odooOptions
          ).catch(() => null);

          const verifiedRequisitions = await queryOdoo(
            'purchase.requisition',
            'search_read',
            [['|', ['name', 'in', suspectedDeletedPrs], ['origin', 'in', suspectedDeletedPrs]]],
            { fields: ['id', 'name', 'origin'] },
            odooOptions
          ).catch(() => null);

          // Safety check: jika query Odoo gagal (network/timeout), jangan hapus apa pun
          if (verifiedReqs !== null && verifiedRequisitions !== null) {
            const stillAliveInOdoo = new Set<string>();
            if (Array.isArray(verifiedReqs)) {
              verifiedReqs.forEach((r: any) => { if (r.name) stillAliveInOdoo.add(r.name.trim()); });
            }
            if (Array.isArray(verifiedRequisitions)) {
              verifiedRequisitions.forEach((r: any) => {
                if (r.name) stillAliveInOdoo.add(r.name.trim());
                if (r.origin) stillAliveInOdoo.add(r.origin.trim());
              });
            }

            const trulyDeletedPrs = suspectedDeletedPrs.filter(pr => !stillAliveInOdoo.has(pr));

            for (const pr of trulyDeletedPrs) {
              // Safety check: pastikan tidak ada PO di Odoo yang mengacu pada PR ini
              const existingPo = await queryOdoo(
                'purchase.order',
                'search_read',
                [[['origin', 'ilike', pr]]],
                { fields: ['id', 'name', 'origin'], limit: 1 },
                odooOptions
              ).catch(() => null);

              if (existingPo && Array.isArray(existingPo) && existingPo.length > 0) {
                logDebug(`[Auto-Cleanup] PR ${pr} tidak dihapus karena ternyata sudah memiliki PO di Odoo (${existingPo[0].name})`);
                continue;
              }

              // Double safety check: jika existingPo null (query error), lewati demi keamanan
              if (existingPo === null) {
                logDebug(`[Auto-Cleanup] Gagal memverifikasi PO Odoo untuk PR ${pr}, melewati.`);
                continue;
              }

              logDebug(`[Auto-Cleanup] PR ${pr} terkonfirmasi telah dihapus dari Odoo dan tidak memiliki PO. Menghapus dari DB lokal.`);
              const deleteRes = await prisma.procurementTracking.deleteMany({
                where: {
                  nomorPr: pr,
                  OR: [
                    { nomorPo: null },
                    { nomorPo: '' }
                  ]
                }
              });
              logDebug(`[Auto-Cleanup] Berhasil menghapus ${deleteRes.count} baris untuk PR ${pr}`);
            }
          } else {
            logDebug(`[Auto-Cleanup] Query Odoo gagal atau timeout saat verifikasi, melewati auto-cleanup.`);
          }
        }
      } catch (errCleanup) {
        console.error('Error saat auto-cleanup PR yang dihapus di Odoo:', errCleanup);
        logDebug(`Error auto-cleanup: ${errCleanup}`);
      }

      const checkDaysAgo = new Date();
      checkDaysAgo.setDate(checkDaysAgo.getDate() - 90);

      // Fokus HANYA pada PR/PO yang masih berjalan (active / ongoing):
      // 1. Memiliki nomor PR atau nomor PO yang valid (bukan null, kosong, atau '-')
      // 2. Belum berstatus DONE/CLOSED (statusPo != 'DONE')
      // 3. Belum berstatus CANCELLED (statusPr != 'CANCELLED' && statusPo != 'CANCELLED')
      // 4. Belum berstatus RECEIVED (kecuali jika baru diterima fisik dalam 90 hari terakhir untuk sinkronisasi dokumen GR Odoo)
      const trackingItems = await prisma.procurementTracking.findMany({
        where: {
          AND: [
            {
              OR: [
                { nomorPr: { not: null, notIn: ['', '-'] } },
                { nomorPo: { not: null, notIn: ['', '-'] } }
              ]
            },
            {
              OR: [
                { statusPo: { not: 'DONE' } },
                { linkGr: { contains: 'model=stock.picking' } }
              ]
            },
            {
              statusPr: { not: 'CANCELLED' }
            },
            {
              statusPo: { not: 'CANCELLED' }
            },
            {
              OR: [
                { statusPr: { not: 'RECEIVED' } },
                { tanggalTerima: { gte: checkDaysAgo } },
                { tanggalTerima: null },
                { linkGr: { contains: 'model=stock.picking' } }
              ]
            }
          ]
        },
        include: {
          sparepart: true
        }
      });

      // Group tracking items by docName (prefer prNo to handle split POs correctly)
      const groupedItems: { [docName: string]: typeof trackingItems } = {};
      for (const item of trackingItems) {
        const prNo = item.nomorPr?.trim();
        const poNo = item.nomorPo?.trim();
        const docName = prNo || poNo;
        if (!docName) continue;
        if (!groupedItems[docName]) {
          groupedItems[docName] = [];
        }
        groupedItems[docName].push(item);
      }

      let updatedOdooCount = 0;

      // Helper function to fetch all Odoo info for a specific group of items (PR/PO)
      const fetchOdooDataForGroup = async (
        docName: string,
        prNo: string | undefined,
        poNos: string[],
        teNos: string[]
      ) => {
        logDebug(`PO Search for document ${docName} -> poNos: ${poNos.join(',')}, prNo: ${prNo}, teNos: ${teNos.join(',')}`);
        const searchCriteria: any[] = [
          ['name', '=', docName],
          ['origin', '=', docName],
          ['partner_ref', '=', docName]
        ];
        for (const teNo of teNos) {
          searchCriteria.push(['name', 'ilike', teNo]);
          searchCriteria.push(['origin', 'ilike', teNo]);
          searchCriteria.push(['partner_ref', 'ilike', teNo]);
        }
        if (prNo && prNo !== docName) {
          searchCriteria.push(['name', 'ilike', prNo]);
          searchCriteria.push(['origin', 'ilike', prNo]);
        }
        for (const poNo of poNos) {
          if (poNo && poNo !== docName) {
            searchCriteria.push(['name', 'ilike', poNo]);
          }
        }

        const buildOrDomain = (criteria: any[]) => {
          const dom: any[] = [];
          for (let i = 0; i < criteria.length - 1; i++) {
            dom.push('|');
          }
          dom.push(...criteria);
          return dom;
        };

        let odooPos = await queryOdoo(
          'purchase.order',
          'search_read',
          [buildOrDomain(searchCriteria)],
          {
            fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order', 'origin', 'partner_ref', 'create_date'],
            limit: 50
          },
          odooOptions
        );

        // Jika belum menemukan PO aktif dan grup ini punya nomor PR, cek apakah ada TE lain di purchase.requisition untuk PR ini
        const hasActivePoInInitial = Array.isArray(odooPos) && odooPos.some((p: any) => p.state !== 'cancel');
        if (!hasActivePoInInitial && prNo) {
          try {
            const linkedTes = await queryOdoo(
              'purchase.requisition',
              'search_read',
              [[['origin', 'ilike', prNo]]],
              { fields: ['id', 'name', 'state'], order: 'id desc', limit: 10 },
              odooOptions
            ).catch(() => []);
            const extraTeNames = (linkedTes || [])
              .map((t: any) => t.name?.trim())
              .filter((n: string) => n && !teNos.includes(n));
            if (extraTeNames.length > 0) {
              const teCriteria: any[] = [];
              for (const tName of extraTeNames) {
                teCriteria.push(['origin', 'ilike', tName]);
                teCriteria.push(['partner_ref', 'ilike', tName]);
              }
              const extraPos = await queryOdoo(
                'purchase.order',
                'search_read',
                [buildOrDomain(teCriteria)],
                {
                  fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order', 'origin', 'partner_ref', 'create_date'],
                  limit: 50
                },
                odooOptions
              ).catch(() => []);
              if (extraPos && extraPos.length > 0) {
                const existingIds = new Set((odooPos || []).map((p: any) => p.id));
                odooPos = [...(odooPos || []), ...extraPos.filter((p: any) => !existingIds.has(p.id))];
              }
            }
          } catch {}
        }

        if (odooPos && odooPos.length > 0) {
          logDebug(`Found ${odooPos.length} PO Matches for ${docName}`);
        }

        // Fuzzy search fallback for purchase.order (handles zero padding e.g. P13722 -> P013722 / PO0013722)
        if (!odooPos || odooPos.length === 0) {
          logDebug(`Exact PO Match failed, entering fuzzy PO search for ${docName}...`);
          const prMatch = docName.match(/^PR0*(\d+)$/i);
          const poMatch = docName.match(/^P(?:O)?0*(\d+)$/i);
          const isPrPattern = !!prMatch;
          const seq = prMatch ? prMatch[1] : (poMatch ? poMatch[1] : null);

          if (seq) {
            try {
              const fuzzyPos = await queryOdoo(
                'purchase.order',
                'search_read',
                [[
                  '|',
                  '|',
                  ['name', 'ilike', seq],
                  ['origin', 'ilike', seq],
                  ['partner_ref', 'ilike', seq]
                ]],
                {
                  fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order', 'origin', 'partner_ref', 'create_date'],
                  limit: 50
                },
                odooOptions
              );

              logDebug(`Fuzzy PO Search returned ${fuzzyPos ? fuzzyPos.length : 0} items for seq: ${seq}`);

              if (fuzzyPos && fuzzyPos.length > 0) {
                const seqRegex = isPrPattern 
                  ? new RegExp('(PR|RFQ)[/0-9-]*0*' + seq + '\\b', 'i')
                  : new RegExp('(?:\\D|^)0*' + seq + '\\b', 'i');

                const matched = fuzzyPos.filter((po: any) => {
                  const name = po.name || '';
                  const origin = po.origin || '';
                  const partnerRef = po.partner_ref || '';
                  return seqRegex.test(name) || seqRegex.test(origin) || seqRegex.test(partnerRef) || name.includes(docName);
                });
                if (matched && matched.length > 0) {
                  logDebug(`Fuzzy matches selected POs for ${docName}: ${JSON.stringify(matched.map((p: any) => p.name))}`);
                  odooPos = matched;
                }
              }
            } catch (errFuzzyPo) {
              console.error(`Gagal melakukan fuzzy search PO untuk ${docName}:`, errFuzzyPo);
            }
          }
        }

        if (!odooPos || odooPos.length === 0) {
          // Document not found in purchase.order. Fallback to PR.
          const prOrDocName = prNo || docName;
          logDebug(`PO not found for ${docName}. Falling back to purchase.request/requisition query for ${prOrDocName}...`);
          try {
            const matchedPR = await findOdooPR(prOrDocName, odooOptions);
            if (matchedPR) {
              return { isPrOnly: true, matchedPR, clearCancelledPo: false };
            }
          } catch (errPR) {
            console.error(`Gagal mencari PR fallback Odoo untuk ${docName}:`, errPR);
          }
          return null;
        }

        // Filter PO aktif (non-cancel) vs PO cancel
        const activePos = odooPos.filter((po: any) => po.state !== 'cancel');
        if (activePos.length > 0) {
          // Gunakan HANYA PO yang aktif (jangan campurkan RFQ/PO yang sudah cancel agar tidak menimpa item aktif menjadi CANCELLED!)
          odooPos = activePos;
          odooPos.sort((a: any, b: any) => {
            const aConfirmed = (a.state === 'purchase' || a.state === 'done') ? 0 : 1;
            const bConfirmed = (b.state === 'purchase' || b.state === 'done') ? 0 : 1;
            if (aConfirmed !== bConfirmed) return aConfirmed - bConfirmed;
            return b.id - a.id;
          });
        } else {
          // Semua PO di Odoo untuk dokumen ini berstatus 'cancel'.
          // Cek apakah dokumen PR aslinya di Odoo masih aktif (tidak rejected/cancel).
          const prOrDocName = prNo || (docName.toUpperCase().startsWith('PR') ? docName : null);
          if (prOrDocName) {
            try {
              const matchedPR = await findOdooPR(prOrDocName, odooOptions);
              if (matchedPR && matchedPR.state !== 'cancel' && matchedPR.state !== 'rejected' && matchedPR.state !== 'close') {
                logDebug(`All POs for ${docName} are cancelled, but PR ${prOrDocName} in Odoo is still ${matchedPR.state}. Treating as PR-only and clearing cancelled PO.`);
                return { isPrOnly: true, matchedPR, clearCancelledPo: true };
              }
            } catch (errPRCheck) {
              console.error(`Gagal memeriksa status PR untuk PO cancel ${docName}:`, errPRCheck);
            }
          }
          // Jika semua PO cancel dan tidak ada PR aktif di Odoo: Tinggalkan saja (jangan sentuh item lokal)
          logDebug(`All POs for ${docName} are cancelled and no active PR found in Odoo. Skipping document (tinggalkan saja).`);
          return null;
        }

        // We found POs! Gather all PO lines and logs
        const allPoLines: any[] = [];
        const allLogs: any[] = [];
        let prCreateDate: Date | null = null;
        let poLinesQueryFailed = false;
        const poGrStatusMap = new Map<number, { isGrDone: boolean, odooGrDate: Date | null, odooGrLink: string | null }>();

        for (const odooPo of odooPos) {
          const poId = odooPo.id;
          const poName = odooPo.name;
          const odooState = odooPo.state;
          const localStatusPr = mapOdooStateToLocal(odooState);
          const vendorName = Array.isArray(odooPo.partner_id) ? odooPo.partner_id[1] : null;
          const amountTotal = odooPo.amount_total || 0;

          // Fetch PO logs, lines, GRs, and Pickings in parallel
          const [poLogs, poLinesRaw, odooGrs, odooPickings] = await Promise.all([
            fetchChatterLogs('purchase.order', poId, 'PO', odooOptions).catch(() => []),
            queryOdoo(
              'purchase.order.line',
              'search_read',
              [[['order_id', '=', poId]]],
              {
                fields: ['id', 'name', 'price_unit', 'price_subtotal', 'price_total', 'product_qty', 'qty_received', 'product_id'],
                limit: 100
              },
              odooOptions
            ).catch(async () => {
              // Retry once after 500ms if transient timeout/error
              await new Promise((r) => setTimeout(r, 500));
              return queryOdoo(
                'purchase.order.line',
                'search_read',
                [[['order_id', '=', poId]]],
                {
                  fields: ['id', 'name', 'price_unit', 'price_subtotal', 'price_total', 'product_qty', 'qty_received', 'product_id'],
                  limit: 100
                },
                odooOptions
              ).catch((errLine) => {
                logDebug(`Failed to fetch purchase.order.line for PO ${poName}: ${errLine}`);
                poLinesQueryFailed = true;
                return [];
              });
            }),
            queryOdoo(
              'good.received',
              'search_read',
              [[['purchase_id', '=', poId]]],
              {
                fields: ['id', 'state', 'write_date', 'date', 'name'],
                order: 'id desc',
                limit: 20
              },
              odooOptions
            ).catch(() => []),
            queryOdoo(
              'stock.picking',
              'search_read',
              [[['origin', '=', poName]]],
              {
                fields: ['id', 'state', 'date_done', 'name'],
                order: 'id desc',
                limit: 20
              },
              odooOptions
            ).catch(() => [])
          ]);

          allLogs.push(...poLogs);

          // Fetch good.received.line for accurate per-line GR status when good.received records exist
          let grLines: any[] = [];
          if (odooGrs && odooGrs.length > 0) {
            const grIds = odooGrs.map((g: any) => g.id);
            grLines = await queryOdoo(
              'good.received.line',
              'search_read',
              [[['good_id', 'in', grIds]]],
              {
                fields: ['id', 'good_id', 'line_purchase_id', 'product_id', 'description', 'quantity', 'received_qty', 'out_standing', 'state'],
                limit: 200
              },
              odooOptions
            ).catch(() => []);
          }

          let odooGrDate: Date | null = null;
          let isGrDone = false;
          let odooGrLink: string | null = null;

          // 1. Check good.received model (prefer 'done' GR for header link/date if all GRs are done)
          if (odooGrs && odooGrs.length > 0) {
            const doneGrs = odooGrs.filter((g: any) => g.state === 'done');
            const pendingGrs = odooGrs.filter((g: any) => g.state !== 'done' && g.state !== 'cancel');
            const primaryGr = doneGrs[0] || odooGrs[0];
            odooGrLink = `https://foomx.odoo.com/web#id=${primaryGr.id}&model=good.received&view_type=form`;
            if (doneGrs.length > 0 && pendingGrs.length === 0) {
              isGrDone = true;
              const rawDate = doneGrs[0].write_date || doneGrs[0].date;
              if (rawDate) {
                const parsedGrDate = new Date(rawDate);
                if (!isNaN(parsedGrDate.getTime())) {
                  odooGrDate = parsedGrDate;
                }
              }
            }
          }

          // 2. Check stock.picking model (for date_done / isGrDone fallback ONLY; linkGr always uses good.received)
          if (odooPickings && odooPickings.length > 0) {
            const donePickings = odooPickings.filter((p: any) => p.state === 'done');
            const pendingPickings = odooPickings.filter((p: any) => p.state !== 'done' && p.state !== 'cancel');
            if (donePickings.length > 0 && pendingPickings.length === 0 && (!odooGrs || odooGrs.length === 0)) {
              isGrDone = true;
              if (donePickings[0].date_done) {
                const parsedDate = new Date(donePickings[0].date_done);
                if (!isNaN(parsedDate.getTime())) {
                  odooGrDate = parsedDate;
                }
              }
            }
          }

          // Filter out zero-quantity PO lines (product_qty <= 0 and qty_received <= 0) on non-cancelled POs
          const validPoLines = (poLinesRaw || []).filter((line: any) => {
            if (odooState === 'cancel') return true;
            return Number(line.product_qty) > 0 || Number(line.qty_received) > 0;
          });

          for (const line of validPoLines) {
            line.parentPoName = poName;
            line.parentPoId = poId;
            line.parentPoState = odooState;
            line.parentLocalStatusPr = localStatusPr;
            line.parentVendorName = vendorName;
            line.parentAmountTotal = amountTotal;

            // Compute exact per-line GR status
            const poLineQty = Number(line.product_qty) || 0;
            const odooQtyReceived = Number(line.qty_received) || 0;
            const myGrLines = grLines.filter(
              (gl: any) => Array.isArray(gl.line_purchase_id) && gl.line_purchase_id[0] === line.id && gl.state !== 'cancel'
            );
            const myDoneGrLines = myGrLines.filter((gl: any) => gl.state === 'done');
            const myPendingGrLines = myGrLines.filter((gl: any) => gl.state !== 'done');

            let grLineReceivedSum = 0;
            for (const gl of myDoneGrLines) {
              const rcv = Number(gl.received_qty) || 0;
              const qty = Number(gl.quantity) || 0;
              const out = Number(gl.out_standing) || 0;
              if (rcv > 0) {
                grLineReceivedSum += rcv;
              } else if (out === 0 && qty > 0 && myPendingGrLines.length === 0) {
                // Covers Odoo GRs where state === 'done', out_standing === 0, quantity > 0, and received_qty was left 0
                grLineReceivedSum += qty;
              }
            }

            const effectiveQtyReceived = Math.max(odooQtyReceived, grLineReceivedSum);
            line.lineEffectiveQtyReceived = effectiveQtyReceived;

            // A PO line is GR Done ONLY if poLineQty > 0 and its received quantity covers poLineQty
            line.lineIsGrDone =
              poLineQty > 0 &&
              (effectiveQtyReceived >= poLineQty ||
                (myGrLines.length === 0 && isGrDone && odooQtyReceived > 0));

            let lineGrLink = odooGrLink;
            let lineGrDate = odooGrDate;
            let linePendingGrLink: string | null = null;
            if (myPendingGrLines.length > 0) {
              const pendingGrId = Array.isArray(myPendingGrLines[0].good_id) ? myPendingGrLines[0].good_id[0] : null;
              const pendingGrObj = (odooGrs || []).find((g: any) => g.id === pendingGrId);
              if (pendingGrObj) {
                linePendingGrLink = `https://foomx.odoo.com/web#id=${pendingGrObj.id}&model=good.received&view_type=form`;
              }
            }
            if (myDoneGrLines.length > 0) {
              const doneGrId = Array.isArray(myDoneGrLines[0].good_id) ? myDoneGrLines[0].good_id[0] : null;
              const doneGrObj = (odooGrs || []).find((g: any) => g.id === doneGrId) || (odooGrs || []).find((g: any) => g.state === 'done');
              if (doneGrObj) {
                lineGrLink = `https://foomx.odoo.com/web#id=${doneGrObj.id}&model=good.received&view_type=form`;
                const rawDate = doneGrObj.write_date || doneGrObj.date;
                if (rawDate) {
                  const parsed = new Date(rawDate);
                  if (!isNaN(parsed.getTime())) lineGrDate = parsed;
                }
              }
            } else if (linePendingGrLink) {
              lineGrLink = linePendingGrLink;
              lineGrDate = null;
            }
            line.lineGrLink = lineGrLink;
            line.linePendingGrLink = linePendingGrLink || lineGrLink;
            line.lineGrDate = lineGrDate;
          }
          allPoLines.push(...validPoLines);

          poGrStatusMap.set(poId, { isGrDone, odooGrDate, odooGrLink });
        }

        // Fetch PR logs
        const originDoc = odooPos[0].origin?.trim();
        const prTargets = Array.from(new Set([originDoc, prNo].filter(Boolean) as string[]));
        for (const target of prTargets) {
          try {
            const matchedPR = await findOdooPR(target, odooOptions);
            if (matchedPR) {
              const prLogs = await fetchChatterLogs(matchedPR.model, matchedPR.id, 'PR', odooOptions).catch(() => []);
              allLogs.push(...prLogs);

              if (matchedPR.create_date) {
                const parsedPrDate = new Date(matchedPR.create_date);
                if (!isNaN(parsedPrDate.getTime())) {
                  prCreateDate = parsedPrDate;
                }
              }
            }
          } catch (errPRLogs) {
            console.error(`Gagal mengambil log PR untuk target ${target}:`, errPRLogs);
          }
        }

        // Deduplicate & sort chatter logs
        const seen = new Set();
        const deduplicatedLogs = allLogs.filter(log => {
          const key = `${log.date}_${log.author}_${log.body}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        deduplicatedLogs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const chatterNotes = deduplicatedLogs.length > 0 ? JSON.stringify(deduplicatedLogs) : '';

        if (!prCreateDate && deduplicatedLogs.length > 0) {
          const oldestLog = deduplicatedLogs[deduplicatedLogs.length - 1];
          const parsedLogDate = new Date(oldestLog.date);
          if (!isNaN(parsedLogDate.getTime())) {
            prCreateDate = parsedLogDate;
          }
        }

        return {
          isPrOnly: false,
          odooPos,
          allPoLines,
          poLinesQueryFailed,
          poGrStatusMap,
          prCreateDate,
          chatterNotes
        };
      };

      // Query Odoo data in controlled batches of 12 groups to prevent RPC timeout storms
      const groupKeys = Object.keys(groupedItems);
      const BATCH_SIZE = 12;
      logDebug(`Starting batched Odoo fetches for ${groupKeys.length} documents (batch size: ${BATCH_SIZE})...`);
      const odooResults: { docName: string; items: typeof trackingItems; data: any; error: any }[] = [];

      for (let i = 0; i < groupKeys.length; i += BATCH_SIZE) {
        const batchKeys = groupKeys.slice(i, i + BATCH_SIZE);
        const batchRes = await Promise.all(
          batchKeys.map(async (docName) => {
            const items = groupedItems[docName];
            const representativeItem = items[0];
            const prNo = representativeItem.nomorPr?.trim();
            const poNos = Array.from(new Set(items.map((it: any) => it.nomorPo?.trim()).filter(Boolean) as string[]));
            const teNos = Array.from(new Set(items.map((it: any) => it.nomorTe?.trim()).filter(Boolean) as string[]));
            try {
              const data = await fetchOdooDataForGroup(docName, prNo, poNos, teNos);
              return { docName, items, data, error: null };
            } catch (err) {
              return { docName, items, data: null, error: err };
            }
          })
        );
        odooResults.push(...batchRes);
      }
      logDebug(`Finished batched Odoo fetches. Processing database updates...`);

      // Process database updates sequentially to avoid write locks and connection limits
      for (const result of odooResults) {
        const { docName, items, data: rawData, error } = result;
        if (error) {
          console.error(`Gagal menyinkronkan status Odoo untuk ${docName}:`, error);
          continue;
        }
        if (!rawData) continue;
        const data = rawData as any;

        if (data.isPrOnly) {
          const matchedPR = data.matchedPR;
          const clearCancelledPo = Boolean(data.clearCancelledPo);
          const reqId = matchedPR.id;
          const reqState = matchedPR.state;
          const isRequisition = matchedPR.model === 'purchase.requisition';
          const localStatusPr = isRequisition
            ? (reqState === 'in_progress' ? 'TO_APPROVE' : reqState === 'open' ? 'RFQ' : reqState === 'done' ? 'APPROVED' : reqState === 'cancel' ? 'CANCELLED' : 'DRAFT')
            : (reqState === 'to_approve' ? 'TO_APPROVE' : reqState === 'approved' ? 'APPROVED' : reqState === 'rejected' ? 'CANCELLED' : reqState === 'done' ? 'APPROVED' : 'DRAFT');

          let prLines: any[] = [];
          try {
            const lineModel = isRequisition ? 'purchase.requisition.line' : 'purchase.request.line';
            const parentField = isRequisition ? 'requisition_id' : 'request_id';
            const priceField = isRequisition ? 'price_unit' : 'estimated_cost';
            const nameField = isRequisition ? 'product_description_variants' : 'name';

            prLines = await queryOdoo(
              lineModel,
              'search_read',
              [[[parentField, '=', reqId]]],
              {
                fields: ['product_id', 'product_qty', priceField, nameField],
                limit: 100
              },
              odooOptions
            );
          } catch (errReqLines) {
            console.error(`Gagal mengambil detail line item ${matchedPR.model} ${matchedPR.name}:`, errReqLines);
          }

          const odooDateRaw = matchedPR.create_date;
          let parsedOdooDate = odooDateRaw ? new Date(odooDateRaw) : null;
          const prLogs = await fetchChatterLogs(matchedPR.model, reqId, 'PR', odooOptions).catch(() => []);
          const chatterNotes = prLogs.length > 0 ? JSON.stringify(prLogs) : '';

          if ((!parsedOdooDate || isNaN(parsedOdooDate.getTime())) && prLogs.length > 0) {
            const oldestLog = prLogs[prLogs.length - 1];
            const tempDate = new Date(oldestLog.date);
            if (tempDate && !isNaN(tempDate.getTime())) {
              parsedOdooDate = tempDate;
            }
          }

          await prisma.$transaction(async (tx) => {
            const priceField = isRequisition ? 'price_unit' : 'estimated_cost';
            const matchedPrMap = matchItemsToLines(items, prLines || []);

            for (const item of items) {
              if (isManuallyArchived(item)) continue;
              let matchedPrice = 0;
              let matchedQty = 0;
              const matchedLine = matchedPrMap.get(item.id) || null;
              if (matchedLine) {
                matchedPrice = matchedLine[priceField] || 0;
                matchedQty = matchedLine.product_qty || 0;
              }

              const odooPrUrl = `https://foomx.odoo.com/web#id=${reqId}&model=${matchedPR.model || 'purchase.request'}&view_type=form`;

              const updateData: any = {
                statusPr: localStatusPr,
                odooNotes: chatterNotes || null,
                linkReferences: combinePrAndPoLinks(item.linkReferences, odooPrUrl, 'pr')
              };
              if (clearCancelledPo || (localStatusPr !== 'CANCELLED' && item.statusPo === 'CANCELLED')) {
                updateData.nomorPo = null;
                updateData.statusPo = null;
                updateData.vendor = null;
                updateData.linkGr = null;
              }
              if (isGenericName(item.originalName)) {
                const lineToUse = matchedLine || (prLines && prLines[0]);
                let specificName = lineToUse ? getBestOdooLineName(lineToUse) : null;
                if (!specificName || isGenericName(specificName)) {
                  const ket = item.keterangan ? item.keterangan.replace(/<[^>]*>/g, '').trim() : '';
                  if (ket && !isGenericName(ket) && ket.length > 2) {
                    specificName = ket;
                  }
                }
                if (!specificName || isGenericName(specificName)) {
                  if (chatterNotes && chatterNotes.includes('<li><b>')) {
                    const matches = chatterNotes.match(/<li><b>([^<]+)<\/b>/g);
                    if (matches && matches.length) {
                      const names = matches.map((m: string) => m.replace(/<\/?b>/g, '').replace('<li>', '').trim()).filter((x: string) => !isGenericName(x));
                      if (names.length) specificName = names[0];
                    }
                  }
                }
                if (specificName && !isGenericName(specificName)) {
                  updateData.originalName = specificName;
                }
              }
              if (matchedPrice > 0 && !item.nomorPo && !item.tanggalTerima && item.statusPo !== 'DONE') {
                const odooPackM = getOdooPackMultiplier(item.linkedPartsJson);
                updateData.harga = odooPackM > 1 ? Number((matchedPrice / odooPackM).toFixed(2)) : matchedPrice;
              }
              if (matchedQty > 0 && item.qty === Math.round(matchedQty)) {
                updateData.qty = Math.round(matchedQty);
              }
              if (parsedOdooDate && !isNaN(parsedOdooDate.getTime())) {
                updateData.tanggalList = parsedOdooDate;
              }

              const hasChanges = hasActualChanges(item, updateData);
              let updatedItem: any = item;

              if (hasChanges) {
                updatedItem = await tx.procurementTracking.update({
                  where: { id: item.id },
                  data: updateData
                });

                if (updatedItem.sparepartId) {
                  const odooPackM = getOdooPackMultiplier(updatedItem.linkedPartsJson);
                  const effectiveUnitPrice = odooPackM > 1 ? Number((matchedPrice / odooPackM).toFixed(2)) : matchedPrice;
                  await syncSparepartProcurement(tx, updatedItem.sparepartId, {
                    odooNotes: chatterNotes || null,
                    candidateHarga: effectiveUnitPrice,
                    allowHargaUpdate:
                      effectiveUnitPrice > 0 &&
                      !updatedItem.nomorPo &&
                      !updatedItem.tanggalTerima &&
                      updatedItem.statusPo !== 'DONE',
                  });
                }
              }
            }
          }, { timeout: 60000, maxWait: 10000 });
          updatedOdooCount += items.length;
        } else {
          // PO update
          const { odooPos, allPoLines, poLinesQueryFailed, poGrStatusMap, prCreateDate, chatterNotes } = data;

          const matchedPoMap = matchItemsToLines(items, allPoLines || []);

          await prisma.$transaction(async (tx) => {
            for (const item of items) {
              if (isManuallyArchived(item)) continue;
              const matchedLine = matchedPoMap.get(item.id) || null;

              // If item doesn't match any PO line in Odoo:
              // Sesuai instruksi: tinggalkan saja, jangan hapus nomorPo atau statusPo lokal yang sudah ada
              if (!matchedLine) {
                const unlinkedUpdate: any = {};
                if (chatterNotes) unlinkedUpdate.odooNotes = chatterNotes;
                if (prCreateDate && !item.tanggalList) unlinkedUpdate.tanggalList = prCreateDate;

                if (Object.keys(unlinkedUpdate).length > 0 && hasActualChanges(item, unlinkedUpdate)) {
                  await tx.procurementTracking.update({
                    where: { id: item.id },
                    data: unlinkedUpdate
                  });
                }
                continue;
              }

              const targetPo = (matchedLine && matchedLine.parentPoId)
                ? (odooPos.find((p: any) => p.id === matchedLine.parentPoId) || odooPos[0])
                : odooPos[0];
              const poId = targetPo.id;
              const poName = (matchedLine && matchedLine.parentPoName) ? matchedLine.parentPoName : targetPo.name;
              const odooState = targetPo.state;
              const localStatusPr = mapOdooStateToLocal(odooState);
              const vendorName = (matchedLine && matchedLine.parentVendorName)
                ? matchedLine.parentVendorName
                : (Array.isArray(targetPo.partner_id) ? targetPo.partner_id[1] : null);
              const amountTotal = targetPo.amount_total || 0;
              const odooPoUrl = `https://foomx.odoo.com/web#id=${poId}&model=purchase.order&view_type=form`;

              const grStatus = poGrStatusMap.get(poId) || { isGrDone: false, odooGrDate: null, odooGrLink: null };
              const odooGrDate = (matchedLine && matchedLine.lineGrDate !== undefined) ? matchedLine.lineGrDate : grStatus.odooGrDate;
              const odooGrLink = (matchedLine && matchedLine.lineGrLink) ? matchedLine.lineGrLink : grStatus.odooGrLink;
              const odooPendingGrLink = (matchedLine && matchedLine.linePendingGrLink) ? matchedLine.linePendingGrLink : odooGrLink;
              const lineIsGrDone = matchedLine ? Boolean(matchedLine.lineIsGrDone) : false;

              let matchedPrice = 0;
              let matchedQty = matchedLine ? Number(matchedLine.product_qty) || 0 : 0;
              let qtyReceived = matchedLine ? Number(matchedLine.lineEffectiveQtyReceived ?? matchedLine.qty_received) || 0 : 0;

              if (matchedLine) {
                const priceTotal = Number(matchedLine.price_total) || 0;
                const priceSubtotal = Number(matchedLine.price_subtotal) || 0;
                const priceUnit = Number(matchedLine.price_unit) || 0;
                if (priceTotal > 0 && matchedQty > 0) {
                  // Gunakan subtotal yang sudah kena PPN (price_total) dibagi Qty
                  matchedPrice = Number((priceTotal / matchedQty).toFixed(2));
                } else if (priceSubtotal > 0 && matchedQty > 0) {
                  matchedPrice = Number(((priceSubtotal * 1.11) / matchedQty).toFixed(2));
                } else if (priceUnit > 0) {
                  matchedPrice = Number((priceUnit * 1.11).toFixed(2));
                }
              }

              const isConfirmedPo = odooState === 'purchase' || odooState === 'done';
              const updateData: any = {
                statusPr: localStatusPr,
                nomorPo: isConfirmedPo ? poName : null,
                odooNotes: chatterNotes || null,
              };
              if ((!item.nomorPr || item.nomorPr.trim() === '') && targetPo && targetPo.origin) {
                const cleanOrigin = targetPo.origin.trim();
                if (cleanOrigin.toUpperCase().startsWith('PR') || cleanOrigin.toUpperCase().startsWith('TE')) {
                  updateData.nomorPr = cleanOrigin;
                }
              }
              if (isGenericName(item.originalName)) {
                const lineToUse = matchedLine || (allPoLines && allPoLines[0]);
                let specificName = lineToUse ? getBestOdooLineName(lineToUse) : null;
                if (!specificName || isGenericName(specificName)) {
                  const ket = item.keterangan ? item.keterangan.replace(/<[^>]*>/g, '').trim() : '';
                  if (ket && !isGenericName(ket) && ket.length > 2) {
                    specificName = ket;
                  }
                }
                if (!specificName || isGenericName(specificName)) {
                  if (chatterNotes && chatterNotes.includes('<li><b>')) {
                    const matches = chatterNotes.match(/<li><b>([^<]+)<\/b>/g);
                    if (matches && matches.length) {
                      const names = matches.map((m: string) => m.replace(/<\/?b>/g, '').replace('<li>', '').trim()).filter((x: string) => !isGenericName(x));
                      if (names.length) specificName = names[0];
                    }
                  }
                }
                if (specificName && !isGenericName(specificName)) {
                  updateData.originalName = specificName;
                }
              }
              if (vendorName) updateData.vendor = vendorName;

              if (prCreateDate) {
                updateData.tanggalList = prCreateDate;
              }
              
              updateData.linkReferences = combinePrAndPoLinks(item.linkReferences, odooPoUrl, 'po');

              const odooPackM = getOdooPackMultiplier(item.linkedPartsJson);
              const isItemAlreadyReceived = Boolean(item.tanggalTerima || item.statusPo === 'DONE');
              if (!isItemAlreadyReceived) {
                if (matchedPrice > 0) {
                  updateData.harga = odooPackM > 1 ? Number((matchedPrice / odooPackM).toFixed(2)) : matchedPrice;
                } else if (
                  amountTotal > 0 &&
                  allPoLines.length === 1 &&
                  matchedQty === 1 &&
                  (!item.harga || Number(item.harga) === 0)
                ) {
                  updateData.harga = odooPackM > 1 ? Number((amountTotal / odooPackM).toFixed(2)) : amountTotal;
                }
              }

              // 1. Deteksi apakah item ini sudah pernah diterima secara fisik di gudang
              let physicallyReceivedDate: Date | null = item.tanggalTerima ? new Date(item.tanggalTerima) : null;
              let physicallyReceivedQty: number = 0;

              // Cari bukti mutasi fisik (StockMovement) untuk item pengadaan ini
              let physicalMovement = await tx.stockMovement.findFirst({
                where: {
                  OR: [
                    { keterangan: { contains: `[Penerimaan Pengadaan #${item.id}` } },
                    { keterangan: { contains: `[Penerimaan Paket #${item.id}` } },
                  ]
                },
                orderBy: { id: 'desc' }
              });

              // Fallback untuk format keterangan historis (tanpa #ID)
              if (!physicalMovement && item.sparepartId && (item.nomorPo || item.nomorPr)) {
                const legacyMov = await tx.stockMovement.findFirst({
                  where: {
                    sparepartId: item.sparepartId,
                    tipe: { in: ['IN', 'LOG'] },
                    ...(item.nomorPo ? { keterangan: { contains: `PO: ${item.nomorPo}` } } : {}),
                    ...(item.nomorPr ? { keterangan: { contains: `PR: ${item.nomorPr}` } } : {})
                  },
                  orderBy: { id: 'desc' }
                });
                const movKet = legacyMov?.keterangan || '';
                if (legacyMov && !movKet.includes('[Penerimaan Pengadaan #') && !movKet.includes('[Penerimaan Paket #') && !movKet.includes('[Odoo Sync Penerimaan')) {
                  physicalMovement = legacyMov;
                }
              }

              // Jika tanggalTerima sebelumnya diisi otomatis oleh bug sync GR Odoo (statusPo === 'DONE' tapi qtyReceived === 0 dan tidak ada physicalMovement), jangan anggap sudah diterima fisik!
              if (!physicalMovement && item.statusPo === 'DONE' && !lineIsGrDone && qtyReceived === 0) {
                physicallyReceivedDate = null;
                physicallyReceivedQty = 0;
              } else if (physicalMovement) {
                if (!physicallyReceivedDate) {
                  physicallyReceivedDate = physicalMovement.tanggal ? new Date(physicalMovement.tanggal) : new Date();
                }
                physicallyReceivedQty = physicalMovement.qty || 0;
              } else if (item.tanggalTerima) {
                physicallyReceivedQty = (item.qty || 0) * getLocalPackMultiplier(item.linkedPartsJson);
              }

              const isItemPhysicallyReceived = !!physicallyReceivedDate;

              // 2. Deteksi sibling items (hanya pecahan parsial dari baris PO yang sama)
              const siblingConditions: any[] = [];
              if (item.sparepartId) {
                siblingConditions.push({
                  OR: [
                    { originalName: item.originalName },
                    { sparepartId: item.sparepartId }
                  ]
                });
              } else {
                siblingConditions.push({ originalName: item.originalName });
              }

              if (item.nomorPr) {
                siblingConditions.push({ nomorPr: item.nomorPr });
                siblingConditions.push({
                  OR: [
                    { nomorPo: poName },
                    { nomorPo: null }
                  ]
                });
              } else {
                siblingConditions.push({ nomorPo: poName });
              }

              const rawSiblingItems = await tx.procurementTracking.findMany({
                where: { AND: siblingConditions }
              });

              const siblingItems = filterTrueSplitSiblings(item, matchedLine, rawSiblingItems, matchedPoMap);

              // Cari sibling lain yang sudah diterima (DONE, tanggalTerima, atau punya StockMovement)
              let alreadyReceivedQty = 0;
              for (const sib of siblingItems) {
                if (sib.id === item.id) continue;
                if (sib.statusPo === 'DONE' || sib.tanggalTerima) {
                  alreadyReceivedQty += (sib.qty || 0) * getLocalPackMultiplier(sib.linkedPartsJson);
                } else {
                  let sibMov = await tx.stockMovement.findFirst({
                    where: {
                      OR: [
                        { keterangan: { contains: `[Penerimaan Pengadaan #${sib.id}` } },
                        { keterangan: { contains: `[Penerimaan Paket #${sib.id}` } },
                      ]
                    }
                  });
                  if (!sibMov && sib.sparepartId && (sib.nomorPo || sib.nomorPr)) {
                    const legacySibMov = await tx.stockMovement.findFirst({
                      where: {
                        sparepartId: sib.sparepartId,
                        tipe: { in: ['IN', 'LOG'] },
                        ...(sib.nomorPo ? { keterangan: { contains: `PO: ${sib.nomorPo}` } } : {}),
                        ...(sib.nomorPr ? { keterangan: { contains: `PR: ${sib.nomorPr}` } } : {})
                      },
                      orderBy: { id: 'desc' }
                    });
                    const sibKet = legacySibMov?.keterangan || '';
                    if (legacySibMov && !sibKet.includes('[Penerimaan Pengadaan #') && !sibKet.includes('[Penerimaan Paket #') && !sibKet.includes('[Odoo Sync Penerimaan')) {
                      sibMov = legacySibMov;
                    }
                  }
                  if (sibMov) {
                    alreadyReceivedQty += (sibMov.qty || sib.qty || 0);
                  }
                }
              }

              const localMult = getLocalPackMultiplier(item.linkedPartsJson);
              const itemQtyInUnits = (item.qty || 0) * localMult;
              const matchedQtyInUnits = matchedQty * odooPackM;
              const qtyReceivedInUnits = qtyReceived * odooPackM;
              const newReceiptQty = qtyReceivedInUnits - alreadyReceivedQty;
              let finalIsGrDone = lineIsGrDone;
              const isPartialOdooGr = !!(matchedLine && qtyReceived > 0 && qtyReceived < matchedQty);
              const parsedItemPack = parsePackMetadata(item.linkedPartsJson);
              const buildSplitChildPackJson = () => {
                if (!parsedItemPack) return item.linkedPartsJson;
                return JSON.stringify({
                  ...parsedItemPack,
                  isConvertedToUnits: true,
                  splitFromId: item.id,
                });
              };

              // 3. Penentuan Quantity aman (Perlindungan Split Items)
              if (siblingItems.length > 1) {
                if (isItemPhysicallyReceived) {
                  updateData.qty = physicallyReceivedQty > 0 ? physicallyReceivedQty : item.qty;
                } else {
                  const remainingFromPo = matchedQtyInUnits > 0 ? Math.max(0, Math.round(matchedQtyInUnits) - alreadyReceivedQty) : item.qty;
                  updateData.qty = remainingFromPo > 0 ? remainingFromPo : item.qty;
                }
              } else {
                const actualRcv = physicallyReceivedQty > 0 ? physicallyReceivedQty : (isItemPhysicallyReceived ? itemQtyInUnits : 0);
                const isReceivedBundle = shouldSkipPartialAutoSplitForBundle(item.linkedPartsJson, isItemPhysicallyReceived);
                if (!isReceivedBundle && isItemPhysicallyReceived && matchedQtyInUnits > 0 && actualRcv < Math.round(matchedQtyInUnits)) {
                  updateData.qty = actualRcv;
                  const remainingFromPo = Math.round(matchedQtyInUnits) - actualRcv;
                  if (remainingFromPo > 0) {
                    await tx.procurementTracking.create({
                      data: {
                        fbIndex: item.fbIndex,
                        originalName: item.originalName,
                        sparepartId: item.sparepartId,
                        keterangan: item.keterangan,
                        penggunaanBulan: item.penggunaanBulan,
                        kontrak3Bulan: item.kontrak3Bulan,
                        tanggalList: prCreateDate || item.tanggalList,
                        qty: remainingFromPo,
                        productCategory: item.productCategory,
                        reason: item.reason,
                        urgency: item.urgency,
                        linkReferences: odooPoUrl,
                        vendor: vendorName || item.vendor,
                        harga: matchedPrice > 0 ? (odooPackM > 1 ? Number((matchedPrice / odooPackM).toFixed(2)) : matchedPrice) : item.harga,
                        nomorPr: item.nomorPr,
                        statusPr: 'PO',
                        statusPo: 'PO',
                        nomorPo: poName,
                        nomorTe: item.nomorTe,
                        odooNotes: chatterNotes || null,
                        linkedPartsJson: buildSplitChildPackJson(),
                        tanggalTerima: null,
                        isStocked: false,
                        linkGr: null
                      }
                    });
                    logDebug(`Auto-split sisa PO untuk Item ID ${item.id}: ${actualRcv} diterima (tetap), ${remainingFromPo} dibuat di PO Terbit`);
                  }
                } else if (matchedQty > 0) {
                  updateData.qty = odooPackM > 1 ? Math.round(matchedQtyInUnits) : Math.round(matchedQty);
                }
              }

              const hasReceivedSplitSibling = siblingItems.some(
                (sib: any) => sib.id !== item.id && (sib.tanggalTerima || sib.statusPo === 'DONE')
              );

              // 4. Status PO dan tanggalTerima (Akurat per baris PO!)
              if (odooState === 'cancel') {
                updateData.statusPr = 'CANCELLED';
                updateData.statusPo = 'CANCELLED';
                finalIsGrDone = false;
              } else if (isPartialOdooGr && newReceiptQty > 0 && newReceiptQty < itemQtyInUnits && item.statusPo !== 'DONE' && !isItemPhysicallyReceived && siblingItems.length === 1) {
                updateData.qty = newReceiptQty;
                updateData.statusPo = 'DONE';
                updateData.statusPr = 'RECEIVED';
                if (parsedItemPack && odooPackM > 1) {
                  updateData.linkedPartsJson = JSON.stringify({
                    ...parsedItemPack,
                    originalPackQty: parsedItemPack.originalPackQty ?? item.qty,
                    isConvertedToUnits: true,
                  });
                }
                if (odooGrDate) updateData.tanggalTerima = odooGrDate;
                if (odooGrLink) {
                  updateData.linkGr = odooGrLink;
                  updateData.linkReferences = combinePrAndPoLinks(updateData.linkReferences || item.linkReferences, odooGrLink, 'gr');
                }
                finalIsGrDone = true;

                const remainingQty = itemQtyInUnits - newReceiptQty;
                await tx.procurementTracking.create({
                  data: {
                    fbIndex: item.fbIndex,
                    originalName: item.originalName,
                    sparepartId: item.sparepartId,
                    keterangan: item.keterangan,
                    penggunaanBulan: item.penggunaanBulan,
                    kontrak3Bulan: item.kontrak3Bulan,
                    tanggalList: prCreateDate || item.tanggalList,
                    qty: remainingQty,
                    productCategory: item.productCategory,
                    reason: item.reason,
                    urgency: item.urgency,
                    linkReferences: odooPendingGrLink ? combinePrAndPoLinks(odooPoUrl, odooPendingGrLink, 'gr') : odooPoUrl,
                    linkGr: odooPendingGrLink || null,
                    vendor: vendorName || item.vendor,
                    harga: matchedPrice > 0 ? (odooPackM > 1 ? Number((matchedPrice / odooPackM).toFixed(2)) : matchedPrice) : item.harga,
                    nomorPr: item.nomorPr,
                    statusPr: localStatusPr,
                    statusPo: localStatusPr === 'APPROVED' ? 'PO' : localStatusPr,
                    nomorPo: poName,
                    odooNotes: chatterNotes || null,
                    linkedPartsJson: buildSplitChildPackJson(),
                  }
                });
                logDebug(`Split GR untuk Item ID ${item.id}: ${newReceiptQty} diterima baru (updated), ${remainingQty} sisa pending (created)`);
              } else if (
                (lineIsGrDone || (newReceiptQty >= itemQtyInUnits && qtyReceived > 0 && matchedQty > 0)) &&
                (isItemPhysicallyReceived || !hasReceivedSplitSibling)
              ) {
                updateData.statusPo = 'DONE';
                updateData.statusPr = 'RECEIVED';
                updateData.tanggalTerima = odooGrDate || physicallyReceivedDate || item.tanggalTerima || new Date();
                if (odooGrLink) {
                  updateData.linkGr = odooGrLink;
                  updateData.linkReferences = combinePrAndPoLinks(updateData.linkReferences || item.linkReferences, odooGrLink, 'gr');
                }
                finalIsGrDone = true;
              } else {
                const pendingPoState = (localStatusPr === 'APPROVED' || localStatusPr === 'PO') ? 'PO' : localStatusPr;
                updateData.statusPo = pendingPoState;
                updateData.statusPr = pendingPoState;

                if (!physicalMovement && item.statusPo === 'DONE' && qtyReceived === 0) {
                  updateData.tanggalTerima = null;
                } else if (physicallyReceivedDate) {
                  updateData.tanggalTerima = physicallyReceivedDate;
                }

                if (odooPendingGrLink) {
                  updateData.linkGr = odooPendingGrLink;
                  updateData.linkReferences = combinePrAndPoLinks(updateData.linkReferences || item.linkReferences, odooPendingGrLink, 'gr');
                }
                finalIsGrDone = false;
              }

              const hasChanges = hasActualChanges(item, updateData);
              let updatedItem: any = item;

              if (hasChanges) {
                updatedItem = await tx.procurementTracking.update({
                  where: { id: item.id },
                  data: updateData
                });
              }

              // 5. Update Master Sparepart menggunakan agregasi terpusat
              if (updatedItem.sparepartId) {
                const effectiveUnitPrice = odooPackM > 1 ? Number((matchedPrice / odooPackM).toFixed(2)) : matchedPrice;
                const updateLeadTime =
                  (finalIsGrDone || Boolean(updatedItem.tanggalTerima)) &&
                  shouldRecalculateLeadTimeOnSync(
                    item.tanggalTerima,
                    item.statusPo,
                    updatedItem.tanggalTerima,
                    updatedItem.statusPo
                  );
                await syncSparepartProcurement(tx, updatedItem.sparepartId, {
                  odooNotes: updatedItem.odooNotes,
                  candidateHarga: effectiveUnitPrice,
                  allowHargaUpdate: effectiveUnitPrice > 0 && !updatedItem.tanggalTerima,
                  updateLeadTime,
                  leadTimeReceiptDate: (odooGrDate || updatedItem.tanggalTerima) ? new Date(odooGrDate || updatedItem.tanggalTerima) : null,
                  leadTimeStartDate: updatedItem.tanggalList ? new Date(updatedItem.tanggalList) : null,
                });
              }
            }
          }, { timeout: 60000, maxWait: 10000 });
          updatedOdooCount += items.length;
        }
      }

      odooSynced = true;
      odooMessage = `Berhasil melacak status & Chatter dari ${updatedOdooCount} dokumen Odoo Cloud (Mengimpor ${importedPrCount} PR baru).`;
    } catch (e: any) {
      odooErrorStr = e.message || String(e);
      console.error('[Sync Route Odoo Error]', e);
    }
  }

  // -------------------------------------------------------------
  // RETURN INTEGRATED RESPONSE
  // -------------------------------------------------------------
  return ok({
    sheets: {
      success: sheetsSynced,
      message: sheetsMessage,
      error: sheetsErrorStr || null
    },
    odoo: {
      success: odooSynced,
      message: odooMessage,
      error: odooErrorStr || null
    }
  });
  } finally {
    if (lockAcquired) {
      await prisma.mtcSetting.delete({ where: { key: 'odoo_sync_lock' } }).catch(() => {});
    }
  }
}
