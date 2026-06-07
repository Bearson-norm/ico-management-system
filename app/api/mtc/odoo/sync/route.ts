import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

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

// Intelligent best match line item helper using name, substring, digits, and quantity scoring
function findBestMatchedLine(lines: any[], item: any): any {
  if (!lines || lines.length === 0) return null;

  const odooItemName = item.sparepart?.nama?.toLowerCase()?.trim() || '';
  const originalName = item.originalName?.toLowerCase()?.trim() || '';
  const targetQty = Number(item.qty) || 0;

  // Extract all digits from originalName for sequence/specs matching (e.g. "isi 2" -> ["2"])
  const originalDigits = originalName.match(/\b\d+\b/g) || [];

  let bestLine = null;
  let bestScore = -1;

  for (const line of lines) {
    const prodName = Array.isArray(line.product_id) ? line.product_id[1]?.toLowerCase()?.trim() : '';
    const lineName = line.name?.toLowerCase()?.trim() || '';
    const lineQty = Number(line.product_qty) || 0;

    let score = 0;

    // 1. Exact Match (highest priority)
    if (originalName && (originalName === prodName || originalName === lineName)) {
      score += 100;
    }
    if (odooItemName && (odooItemName === prodName || odooItemName === lineName)) {
      score += 80;
    }

    // 2. Substring Match (safeguarded against empty/short strings to prevent bug)
    if (prodName && prodName.length > 3) {
      if (originalName.includes(prodName) || prodName.includes(originalName)) {
        score += 20;
      }
      if (odooItemName && (odooItemName.includes(prodName) || prodName.includes(odooItemName))) {
        score += 15;
      }
    }

    if (lineName && lineName.length > 3) {
      if (originalName.includes(lineName) || lineName.includes(originalName)) {
        score += 20;
      }
      if (odooItemName && (odooItemName.includes(lineName) || lineName.includes(odooItemName))) {
        score += 15;
      }
    }

    // 3. Digit/Number Sequence Match (crucial tie-breaker for multi-spec things)
    if (originalDigits.length > 0) {
      let digitMatchCount = 0;
      for (const d of originalDigits) {
        const regex = new RegExp('\\b' + d + '\\b');
        if (regex.test(prodName) || regex.test(lineName)) {
          digitMatchCount++;
        }
      }
      score += digitMatchCount * 12;
    }

    // 4. Quantity Match (excellent tie-breaker)
    if (targetQty > 0 && targetQty === lineQty) {
      score += 8;
    }

    // Update best matched line candidate
    if (score > 0 && score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
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
        limit: 15
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
    const odooUid = options.odooUid || 34;

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

// Helper to find Requisitions or Requests by name with fuzzy fallback
async function findOdooPR(
  prName: string,
  odooOptions: any
): Promise<{ model: 'purchase.requisition' | 'purchase.request'; id: number; name: string; state: string; create_date?: string } | null> {
  const cleanPrName = prName.trim();
  if (!cleanPrName) return null;

  // 1. Try exact purchase.requisition
  try {
    const reqs = await queryOdoo(
      'purchase.requisition',
      'search_read',
      [[['name', '=', cleanPrName]]],
      { fields: ['id', 'name', 'state', 'create_date'], limit: 1 },
      odooOptions
    );
    if (reqs && reqs.length > 0) {
      logDebug(`Exact Requisition Match found for ${cleanPrName}: ${reqs[0].name}`);
      return { model: 'purchase.requisition', ...reqs[0] };
    }
  } catch (e: any) {
    logDebug(`Error querying exact purchase.requisition: ${e.message || e}`);
  }

  // 2. Try fuzzy purchase.requisition
  const prMatch = cleanPrName.match(/^PR0*(\d+)$/i);
  if (prMatch) {
    const seq = prMatch[1];
    try {
      const fuzzyReqs = await queryOdoo(
        'purchase.requisition',
        'search_read',
        [[['name', 'ilike', seq]]],
        { fields: ['id', 'name', 'state', 'create_date'], limit: 20 },
        odooOptions
      );
      if (fuzzyReqs && fuzzyReqs.length > 0) {
        const regex = new RegExp('(?:\\D|^)0*' + seq + '\\\\b', 'i');
        const matched = fuzzyReqs.find((req: any) => regex.test(req.name) || req.name?.includes(cleanPrName));
        if (matched) {
          logDebug(`Fuzzy Requisition Match selected for seq ${seq}: ${matched.name}`);
          return { model: 'purchase.requisition', ...matched };
        }
      }
    } catch (e: any) {
      logDebug(`Error querying fuzzy purchase.requisition: ${e.message || e}`);
    }
  }

  // 3. Try exact purchase.request
  try {
    const reqs = await queryOdoo(
      'purchase.request',
      'search_read',
      [[['name', '=', cleanPrName]]],
      { fields: ['id', 'name', 'state', 'create_date'], limit: 1 },
      odooOptions
    );
    if (reqs && reqs.length > 0) {
      logDebug(`Exact Request Match found for ${cleanPrName}: ${reqs[0].name}`);
      return { model: 'purchase.request', ...reqs[0] };
    }
  } catch (e: any) {
    logDebug(`Error querying exact purchase.request: ${e.message || e}`);
  }

  // 4. Try fuzzy purchase.request
  if (prMatch) {
    const seq = prMatch[1];
    try {
      const fuzzyReqs = await queryOdoo(
        'purchase.request',
        'search_read',
        [[['name', 'ilike', seq]]],
        { fields: ['id', 'name', 'state', 'create_date'], limit: 20 },
        odooOptions
      );
      if (fuzzyReqs && fuzzyReqs.length > 0) {
        const regex = new RegExp('(?:\\D|^)0*' + seq + '\\\\b', 'i');
        const matched = fuzzyReqs.find((req: any) => regex.test(req.name) || req.name?.includes(cleanPrName));
        if (matched) {
          logDebug(`Fuzzy Request Match selected for seq ${seq}: ${matched.name}`);
          return { model: 'purchase.request', ...matched };
        }
      }
    } catch (e: any) {
      logDebug(`Error querying fuzzy purchase.request: ${e.message || e}`);
    }
  }

  logDebug(`Requisition/Request not found in Odoo for ${cleanPrName}`);
  return null;
}


// POST /api/mtc/odoo/sync
export async function POST(req: NextRequest) {
  // Check CRON_TOKEN bypass
  const authHeader = req.headers.get('Authorization');
  const queryToken = req.nextUrl.searchParams.get('token');
  const reqToken = (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null) || queryToken;
  
  let isAuthorized = false;
  if (reqToken && process.env.CRON_TOKEN && reqToken === process.env.CRON_TOKEN) {
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

  const sheetUrl = bodySheetUrl?.trim() || process.env.SCM_SHEET_URL?.trim() || '';
  const odooPassword = bodyOdooPassword || process.env.ODOO_PASSWORD || '';
  const odooSessionId = bodyOdooSessionId || process.env.ODOO_SESSION_ID || '';
  const odooDb = bodyOdooDb || process.env.ODOO_DB || 'foom-production-5808833';
  
  let odooUid = 34;
  if (bodyOdooUid != null) {
    odooUid = Number(bodyOdooUid);
  } else if (process.env.ODOO_UID) {
    odooUid = parseInt(process.env.ODOO_UID) || 34;
  }

  let sheetsSynced = false;
  let odooSynced = false;
  let sheetsMessage = '';
  let odooMessage = '';
  let sheetsErrorStr = '';
  let odooErrorStr = '';

  // -------------------------------------------------------------
  // STEP 1: SINKRONISASI GOOGLE SHEETS
  // -------------------------------------------------------------
  if (sheetUrl && sheetUrl.trim()) {
    try {
      let sheetId = sheetUrl.trim();
      const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        sheetId = match[1];
      }
      const fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(fetchUrl);
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

            // Find matching item in db
            let trackingItem = null;
            if (fbIndex != null) {
              trackingItem = await tx.procurementTracking.findFirst({
                where: { fbIndex },
              });
            } else {
              trackingItem = await tx.procurementTracking.findFirst({
                where: { originalName, qty },
              });
            }

            if (trackingItem) {
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

              // If Sparepart is matched, update its price and status in the master spareparts DB too
              if (trackingItem.sparepartId) {
                const sp = await tx.sparepart.findUnique({
                  where: { id: trackingItem.sparepartId },
                  select: { purchasingStatus: true, harga: true }
                });
                const currentSpStatus = sp?.purchasingStatus || 'NONE';
                const isPriceUpdate = finalHarga > 0 && (currentSpStatus === 'NONE' || currentSpStatus === 'WAITING_PRICE' || currentSpStatus === 'DRAFT');
                
                await tx.sparepart.update({
                  where: { id: trackingItem.sparepartId },
                  data: {
                    ...(isPriceUpdate ? {
                      harga: finalHarga,
                      purchasingStatus: 'READY_ODOO',
                    } : {
                      harga: finalHarga > 0 ? finalHarga : undefined,
                    }),
                    ...(finalNomorPr ? { purchasingNoPr: finalNomorPr } : {}),
                    ...(finalNomorPo ? { purchasingNoPo: finalNomorPo } : {}),
                    ...(linkReferences ? { linkReference: linkReferences } : {}),
                  }
                });
              }

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
                }
              });
              updatedCount++;
            } else {
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
                }
              });

              // If Sparepart is matched, update its price and status in the master spareparts DB too
              if (sparepartId) {
                const sp = await tx.sparepart.findUnique({
                  where: { id: sparepartId },
                  select: { purchasingStatus: true, harga: true }
                });
                const currentSpStatus = sp?.purchasingStatus || 'NONE';
                const isPriceUpdate = harga > 0 && (currentSpStatus === 'NONE' || currentSpStatus === 'WAITING_PRICE' || currentSpStatus === 'DRAFT');

                await tx.sparepart.update({
                  where: { id: sparepartId },
                  data: {
                    ...(isPriceUpdate ? {
                      harga: harga,
                      purchasingStatus: 'READY_ODOO',
                    } : {
                      harga: harga > 0 ? harga : undefined,
                    }),
                    ...(nomorPr ? { purchasingNoPr: nomorPr } : {}),
                    ...(nomorPo ? { purchasingNoPo: nomorPo } : {}),
                    ...(linkReferences ? { linkReference: linkReferences } : {}),
                  }
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
      // 2a. Import new PRs from Odoo created by this user in the last 45 days
      const thirtyDaysAgoDate = new Date();
      thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 45);
      const thirtyDaysAgoStr = thirtyDaysAgoDate.toISOString().replace('T', ' ').substring(0, 19);
      const parsedUid = parseInt(String(odooUid)) || 34;

      let importedPrCount = 0;

      // Import from purchase.requisition
      try {
        logDebug(`Mencari purchase.requisition baru di Odoo sejak ${thirtyDaysAgoStr} untuk UID ${parsedUid}...`);
        const recentRequisitions = await queryOdoo(
          'purchase.requisition',
          'search_read',
          [[
            ['create_date', '>=', thirtyDaysAgoStr],
            ['create_uid', '=', parsedUid]
          ]],
          { fields: ['id', 'name', 'state', 'create_date', 'description'] },
          odooOptions
        );

        if (recentRequisitions && recentRequisitions.length > 0) {
          logDebug(`Ditemukan ${recentRequisitions.length} purchase.requisition baru di Odoo.`);
          for (const req of recentRequisitions) {
            const prName = req.name?.trim();
            if (!prName) continue;

            // Check if we already have this PR in procurementTracking
            const existingCount = await prisma.procurementTracking.count({
              where: { nomorPr: prName }
            });

            if (existingCount === 0) {
              logDebug(`PR Requisition baru "${prName}" belum ada di DB lokal. Mengimpor line items...`);
              // Fetch line items
              const lines = await queryOdoo(
                'purchase.requisition.line',
                'search_read',
                [[['requisition_id', '=', req.id]]],
                { fields: ['product_id', 'product_qty', 'price_unit', 'name'], limit: 50 },
                odooOptions
              );

              if (lines && lines.length > 0) {
                let localStatusPr = 'DRAFT';
                const reqState = req.state;
                if (reqState === 'in_progress') localStatusPr = 'TO_APPROVE';
                else if (reqState === 'open') localStatusPr = 'RFQ';
                else if (reqState === 'done') localStatusPr = 'APPROVED';
                else if (reqState === 'cancel') localStatusPr = 'CANCELLED';

                const prDate = req.create_date ? new Date(req.create_date) : new Date();

                await prisma.$transaction(async (tx) => {
                  for (const line of lines) {
                    const prodName = Array.isArray(line.product_id) ? line.product_id[1] : (line.name || 'Produk Tanpa Nama');
                    const qty = Number(line.product_qty) || 1;
                    const price = Number(line.price_unit) || 0;

                    // Match sparepart master if possible
                    let sparepartId: string | null = null;
                    const matchedSp = await tx.sparepart.findFirst({
                      where: { nama: { equals: prodName, mode: 'insensitive' } }
                    });
                    if (matchedSp) {
                      sparepartId = matchedSp.id;
                    }

                    await tx.procurementTracking.create({
                      data: {
                        originalName: prodName,
                        qty,
                        harga: price,
                        nomorPr: prName,
                        statusPr: localStatusPr,
                        tanggalList: prDate,
                        keterangan: line.name || null,
                        sparepartId,
                        productCategory: 'Sparepart',
                        urgency: 'Normal'
                      }
                    });
                  }
                });
                importedPrCount++;
              }
            }
          }
        }
      } catch (errReqImport) {
        console.error('Gagal mengimpor purchase.requisition baru dari Odoo:', errReqImport);
        logDebug(`Error requisition import: ${errReqImport}`);
      }

      // Import from purchase.request
      try {
        logDebug(`Mencari purchase.request baru di Odoo sejak ${thirtyDaysAgoStr} untuk UID ${parsedUid}...`);
        const recentRequests = await queryOdoo(
          'purchase.request',
          'search_read',
          [[
            ['create_date', '>=', thirtyDaysAgoStr],
            ['create_uid', '=', parsedUid]
          ]],
          { fields: ['id', 'name', 'state', 'create_date', 'description'] },
          odooOptions
        );

        if (recentRequests && recentRequests.length > 0) {
          logDebug(`Ditemukan ${recentRequests.length} purchase.request baru di Odoo.`);
          for (const req of recentRequests) {
            const prName = req.name?.trim();
            if (!prName) continue;

            // Check if we already have this PR in procurementTracking
            const existingCount = await prisma.procurementTracking.count({
              where: { nomorPr: prName }
            });

            if (existingCount === 0) {
              logDebug(`PR Request baru "${prName}" belum ada di DB lokal. Mengimpor line items...`);
              // Fetch line items
              const lines = await queryOdoo(
                'purchase.request.line',
                'search_read',
                [[['request_id', '=', req.id]]],
                { fields: ['product_id', 'product_qty', 'estimated_cost', 'name'], limit: 50 },
                odooOptions
              );

              if (lines && lines.length > 0) {
                let localStatusPr = 'DRAFT';
                const reqState = req.state;
                if (reqState === 'to_approve') localStatusPr = 'TO_APPROVE';
                else if (reqState === 'approved') localStatusPr = 'APPROVED';
                else if (reqState === 'rejected') localStatusPr = 'CANCELLED';
                else if (reqState === 'done') localStatusPr = 'PO';

                const prDate = req.create_date ? new Date(req.create_date) : new Date();

                await prisma.$transaction(async (tx) => {
                  for (const line of lines) {
                    const prodName = Array.isArray(line.product_id) ? line.product_id[1] : (line.name || 'Produk Tanpa Nama');
                    const qty = Number(line.product_qty) || 1;
                    const price = Number(line.estimated_cost) || 0;

                    // Match sparepart master if possible
                    let sparepartId: string | null = null;
                    const matchedSp = await tx.sparepart.findFirst({
                      where: { nama: { equals: prodName, mode: 'insensitive' } }
                    });
                    if (matchedSp) {
                      sparepartId = matchedSp.id;
                    }

                    await tx.procurementTracking.create({
                      data: {
                        originalName: prodName,
                        qty,
                        harga: price,
                        nomorPr: prName,
                        statusPr: localStatusPr,
                        tanggalList: prDate,
                        keterangan: line.name || null,
                        sparepartId,
                        productCategory: 'Sparepart',
                        urgency: 'Normal'
                      }
                    });
                  }
                });
                importedPrCount++;
              }
            }
          }
        }
      } catch (errReqImport) {
        console.error('Gagal mengimpor purchase.request baru dari Odoo:', errReqImport);
        logDebug(`Error request import: ${errReqImport}`);
      }

      // Find all active tracking items that have a PR or PO number and are not yet complete,
      // OR completed items that are still missing vendor names or Odoo chatter notes.
      const trackingItems = await prisma.procurementTracking.findMany({
        where: {
          AND: [
            {
              OR: [
                { nomorPr: { not: null } },
                { nomorPo: { not: null } },
              ],
            },
            {
              OR: [
                { statusPo: null },
                { NOT: { statusPo: 'DONE' } },
                { vendor: null },
                { odooNotes: null },
              ],
            }
          ]
        },
        include: {
          sparepart: true
        }
      });

      // Group tracking items by docName to prevent duplicate Odoo network requests
      const groupedItems: { [docName: string]: typeof trackingItems } = {};
      for (const item of trackingItems) {
        const prNo = item.nomorPr?.trim();
        const poNo = item.nomorPo?.trim();
        const docName = poNo || prNo;
        if (!docName) continue;
        if (!groupedItems[docName]) {
          groupedItems[docName] = [];
        }
        groupedItems[docName].push(item);
      }

      let updatedOdooCount = 0;

      for (const docName of Object.keys(groupedItems)) {
        const items = groupedItems[docName];
        const representativeItem = items[0];
        const prNo = representativeItem.nomorPr?.trim();
        const poNo = representativeItem.nomorPo?.trim();

        try {
          logDebug(`PO Search for document ${docName} -> poNo: ${poNo}, prNo: ${prNo} (${items.length} items)`);
          // 1. Search for PO/RFQ in Odoo matching name, origin, or partner_ref (Vendor Reference)
          let odooPos = await queryOdoo(
            'purchase.order',
            'search_read',
            [[
              '|',
              '|',
              ['name', '=', docName],
              ['origin', '=', docName],
              ['partner_ref', '=', docName]
            ]],
            {
              fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order', 'origin', 'partner_ref', 'create_date'],
              limit: 1
            },
            odooOptions
          );

          if (odooPos && odooPos.length > 0) {
            logDebug(`Exact PO Match found: ${JSON.stringify(odooPos[0])}`);
          }

          // Fuzzy search fallback for purchase.order (handles zero padding e.g. P13722 -> P013722 / PO0013722)
          if (!odooPos || odooPos.length === 0) {
            logDebug(`Exact PO Match failed, entering fuzzy PO search...`);
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
                    limit: 20
                  },
                  odooOptions
                );

                logDebug(`Fuzzy PO Search returned ${fuzzyPos ? fuzzyPos.length : 0} items for seq: ${seq}`);

                if (fuzzyPos && fuzzyPos.length > 0) {
                  // If it's a PR search, match origin/ref. If PO search, match the PO name.
                  const seqRegex = isPrPattern 
                    ? new RegExp('(PR|RFQ)[/0-9-]*0*' + seq + '\\\\b', 'i')
                    : new RegExp('(?:\\\\D|^)0*' + seq + '\\\\b', 'i');

                  logDebug(`Fuzzy match regex: ${seqRegex.source}`);

                  const matched = fuzzyPos.find((po: any) => {
                    const name = po.name || '';
                    const origin = po.origin || '';
                    const partnerRef = po.partner_ref || '';
                    const isMatched = seqRegex.test(name) || seqRegex.test(origin) || seqRegex.test(partnerRef) || name.includes(docName);
                    logDebug(`  Testing PO: ${name}, origin: ${origin}, ref: ${partnerRef} -> Matched? ${isMatched}`);
                    return isMatched;
                  });
                  if (matched) {
                    logDebug(`Fuzzy match selected PO: ${JSON.stringify(matched)}`);
                    odooPos = [matched];
                  } else {
                    logDebug(`Fuzzy matches failed filter regex.`);
                  }
                }
              } catch (errFuzzyPo) {
                logDebug(`Fuzzy search error: ${errFuzzyPo}`);
                console.error(`Gagal melakukan fuzzy search PO untuk ${docName}:`, errFuzzyPo);
              }
            }
          }

          if (odooPos && odooPos.length > 0) {
            const odooPo = odooPos[0];
            const poId = odooPo.id;
            const poName = odooPo.name; // Real PO number (e.g. P10489)
            const odooState = odooPo.state; // e.g. draft, sent, to approve, purchase, done, cancel
            const localStatusPr = mapOdooStateToLocal(odooState);

            const vendorName = Array.isArray(odooPo.partner_id) ? odooPo.partner_id[1] : null;
            const amountTotal = odooPo.amount_total || 0;
            const originDoc = odooPo.origin?.trim();

            let combinedLogs: any[] = [];

            // Fetch PO logs
            const poLogs = await fetchChatterLogs('purchase.order', poId, 'PO', odooOptions);
            combinedLogs.push(...poLogs);

            // Fetch specific PO Line Item Price & Details (ONLY ONCE for the document!)
            let poLines: any[] = [];
            try {
              poLines = await queryOdoo(
                'purchase.order.line',
                'search_read',
                [[['order_id', '=', poId]]],
                {
                  fields: ['name', 'price_unit', 'product_qty', 'product_id'],
                  limit: 50
                },
                odooOptions
              );
            } catch (errLines) {
              console.error(`Gagal mengambil detail line item PO ${poName}:`, errLines);
            }

            // Fetch PR logs if originDoc or prNo are present
            let prCreateDate: Date | null = null;
            const prTargets = Array.from(new Set([originDoc, prNo].filter(Boolean) as string[]));
            for (const target of prTargets) {
              try {
                const matchedPR = await findOdooPR(target, odooOptions);
                if (matchedPR) {
                  const prLogs = await fetchChatterLogs(matchedPR.model, matchedPR.id, 'PR', odooOptions);
                  combinedLogs.push(...prLogs);

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

            // Deduplicate logs by unique (date + body + author)
            const seen = new Set();
            combinedLogs = combinedLogs.filter(log => {
              const key = `${log.date}_${log.author}_${log.body}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            // Sort descending by date
            combinedLogs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const chatterNotes = combinedLogs.length > 0 ? JSON.stringify(combinedLogs) : '';

            // Fallback: if prCreateDate is still null, extract the oldest date from the chatter logs (representing PR creation)
            if (!prCreateDate && combinedLogs.length > 0) {
              const oldestLog = combinedLogs[combinedLogs.length - 1];
              const parsedLogDate = new Date(oldestLog.date);
              if (!isNaN(parsedLogDate.getTime())) {
                prCreateDate = parsedLogDate;
              }
            }

            // 2b. Search for associated Good Received (GR) in Odoo (ONLY ONCE for the document!)
            let odooGrDate: Date | null = null;
            let isGrDone = false;
            let odooGrLink: string | null = null;
            try {
              const odooGrs = await queryOdoo(
                'good.received',
                'search_read',
                [[['purchase_id', '=', poId]]],
                {
                  fields: ['id', 'state', 'write_date', 'name'],
                  limit: 1
                },
                odooOptions
              );

              if (odooGrs && odooGrs.length > 0) {
                const odooGr = odooGrs[0];
                odooGrLink = `https://foomx.odoo.com/web#id=${odooGr.id}&model=good.received&view_type=form`;
                if (odooGr.state === 'done') {
                  isGrDone = true;
                  if (odooGr.write_date) {
                    const parsedGrDate = new Date(odooGr.write_date);
                    if (!isNaN(parsedGrDate.getTime())) {
                      odooGrDate = parsedGrDate;
                    }
                  }
                }
              }
            } catch (errGr: any) {
              logDebug(`Gagal mencari Good Received Odoo untuk PO ID ${poId}: ${errGr.message || errGr}`);
            }

            // 3. Update all items under this group locally
            await prisma.$transaction(async (tx) => {
              // Direct Odoo PO URL
              const odooPoUrl = `https://foomx.odoo.com/web#id=${poId}&model=purchase.order&view_type=form`;

              for (const item of items) {
                // Find matching price/qty for each specific item in the group
                let matchedPrice = 0;
                let matchedQty = 0;
                if (poLines && poLines.length > 0) {
                  const matchedLine = findBestMatchedLine(poLines, item);
                  if (matchedLine) {
                    matchedPrice = matchedLine.price_unit || 0;
                    matchedQty = matchedLine.product_qty || 0;
                  }
                }

                // Update tracking item
                const updateData: any = {
                  statusPr: localStatusPr,
                  nomorPo: poName,
                  odooNotes: chatterNotes || null,
                };
                if (vendorName) updateData.vendor = vendorName;

                // Set tanggalList to the actual PR creation date from Odoo, NOT the PO creation date.
                // This ensures that lead time calculations are based on the original request date.
                if (prCreateDate) {
                  updateData.tanggalList = prCreateDate;
                }
                
                // Populate Odoo PO URL as linkReferences if empty
                if (!item.linkReferences) {
                  updateData.linkReferences = odooPoUrl;
                }

                // Update price: prefer specific PO line item price, fallback to overall PO amount
                if (matchedPrice > 0) {
                  updateData.harga = matchedPrice;
                } else if (amountTotal > 0 && (!item.harga || Number(item.harga) === 0)) {
                  updateData.harga = amountTotal;
                }

                // Update quantity from Odoo
                if (matchedQty > 0) {
                  updateData.qty = Math.round(matchedQty);
                }

                // If Good Received is Done in Odoo, update statusPo & tanggalTerima
                if (isGrDone) {
                  updateData.statusPo = 'DONE';
                  if (odooGrDate) {
                    updateData.tanggalTerima = odooGrDate;
                  }
                  if (odooGrLink) {
                    updateData.linkGr = odooGrLink;
                  }
                }

                const hasChanges = hasActualChanges(item, updateData);
                let updatedItem = item;

                if (hasChanges) {
                  updatedItem = await tx.procurementTracking.update({
                    where: { id: item.id },
                    data: updateData
                  });

                  // Propagate to master Spareparts DB
                  if (updatedItem.sparepartId) {
                    const spUpdate: any = {
                      purchasingStatus: isGrDone ? 'NONE' : localStatusPr,
                      purchasingNoPr: isGrDone ? null : updatedItem.nomorPr,
                      purchasingNoPo: isGrDone ? null : updatedItem.nomorPo,
                      odooNotes: updatedItem.odooNotes,
                      purchasingQty: isGrDone ? 0 : updatedItem.qty,
                      // Also propagate unit price to master DB if fetched from PO line
                      ...(matchedPrice > 0 ? { harga: matchedPrice } : {})
                    };

                    if (isGrDone && odooGrDate) {
                      const sp = await tx.sparepart.findUnique({ where: { id: updatedItem.sparepartId } });
                      if (sp) {
                        const elapsedMs = odooGrDate.getTime() - new Date(updatedItem.tanggalList).getTime();
                        const elapsedDays = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24));
                        const calculatedAvgLeadTime = sp.avgLeadTime === 0
                          ? elapsedDays
                          : Number((sp.avgLeadTime * 0.8 + elapsedDays * 0.2).toFixed(2));
                        const calculatedMaxLeadTime = Math.max(sp.maxLeadTime, Math.round(elapsedDays));
                        
                        spUpdate.avgLeadTime = calculatedAvgLeadTime;
                        spUpdate.maxLeadTime = calculatedMaxLeadTime;
                        spUpdate.prDate = null;
                        spUpdate.poDate = null;
                      }
                    }

                    await tx.sparepart.update({
                      where: { id: updatedItem.sparepartId },
                      data: spUpdate
                    });
                  }
                }
              }
            });

            updatedOdooCount += items.length;
          } else {
            // Document not found in purchase.order. Try purchase.requisition/request.
            const prOrDocName = prNo || docName;
            logDebug(`PO not found in purchase.order. Falling back to purchase.requisition/request query for prOrDocName: ${prOrDocName}...`);
            try {
              const matchedPR = await findOdooPR(prOrDocName, odooOptions);
              if (matchedPR) {
                const reqId = matchedPR.id;
                const reqState = matchedPR.state;
                const isRequisition = matchedPR.model === 'purchase.requisition';
                
                let localStatusPr = 'DRAFT';
                if (isRequisition) {
                  if (reqState === 'in_progress') localStatusPr = 'TO_APPROVE';
                  else if (reqState === 'open') localStatusPr = 'RFQ';
                  else if (reqState === 'done') localStatusPr = 'APPROVED';
                  else if (reqState === 'cancel') localStatusPr = 'CANCELLED';
                } else {
                  if (reqState === 'to_approve') localStatusPr = 'TO_APPROVE';
                  else if (reqState === 'approved') localStatusPr = 'APPROVED';
                  else if (reqState === 'rejected') localStatusPr = 'CANCELLED';
                  else if (reqState === 'done') localStatusPr = 'PO';
                }

                const prLogs = await fetchChatterLogs(matchedPR.model, reqId, 'PR', odooOptions);
                prLogs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const chatterNotes = prLogs.length > 0 ? JSON.stringify(prLogs) : '';

                // Fetch line items price (ONLY ONCE for the group!)
                let prLines: any[] = [];
                try {
                  const lineModel = isRequisition ? 'purchase.requisition.line' : 'purchase.request.line';
                  const parentField = isRequisition ? 'requisition_id' : 'request_id';
                  const priceField = isRequisition ? 'price_unit' : 'estimated_cost';

                  prLines = await queryOdoo(
                    lineModel,
                    'search_read',
                    [[[parentField, '=', reqId]]],
                    {
                      fields: ['product_id', 'product_qty', priceField, 'name'],
                      limit: 50
                    },
                    odooOptions
                  );
                } catch (errReqLines) {
                  console.error(`Gagal mengambil detail line item ${matchedPR.model} ${matchedPR.name}:`, errReqLines);
                }

                const odooDateRaw = matchedPR.create_date;
                let parsedOdooDate = odooDateRaw ? new Date(odooDateRaw) : null;
                if ((!parsedOdooDate || isNaN(parsedOdooDate.getTime())) && prLogs.length > 0) {
                  const oldestLog = prLogs[prLogs.length - 1];
                  const tempDate = new Date(oldestLog.date);
                  if (tempDate && !isNaN(tempDate.getTime())) {
                    parsedOdooDate = tempDate;
                  }
                }

                await prisma.$transaction(async (tx) => {
                  const priceField = isRequisition ? 'price_unit' : 'estimated_cost';

                  for (const item of items) {
                    let matchedPrice = 0;
                    let matchedQty = 0;
                    if (prLines && prLines.length > 0) {
                      const matchedLine = findBestMatchedLine(prLines, item);
                      if (matchedLine) {
                        matchedPrice = matchedLine[priceField] || 0;
                        matchedQty = matchedLine.product_qty || 0;
                      }
                    }

                    const updateData: any = {
                      statusPr: localStatusPr,
                      odooNotes: chatterNotes || null
                    };
                    if (matchedPrice > 0) {
                      updateData.harga = matchedPrice;
                    }
                    if (matchedQty > 0) {
                      updateData.qty = Math.round(matchedQty);
                    }
                    if (parsedOdooDate && !isNaN(parsedOdooDate.getTime())) {
                      updateData.tanggalList = parsedOdooDate;
                    }

                    const hasChanges = hasActualChanges(item, updateData);
                    let updatedItem = item;

                    if (hasChanges) {
                      updatedItem = await tx.procurementTracking.update({
                        where: { id: item.id },
                        data: updateData
                      });

                      if (updatedItem.sparepartId) {
                        await tx.sparepart.update({
                          where: { id: updatedItem.sparepartId },
                          data: {
                            purchasingStatus: localStatusPr,
                            purchasingNoPr: updatedItem.nomorPr,
                            odooNotes: chatterNotes || null,
                            purchasingQty: updatedItem.qty,
                            ...(matchedPrice > 0 ? { harga: matchedPrice } : {})
                          }
                        });
                      }
                    }
                  }
                });
                updatedOdooCount += items.length;
              }
            } catch (errReq) {
              console.error(`Gagal melacak PR Requisition/Request Odoo untuk ${docName}:`, errReq);
            }
          }
        } catch (errItem) {
          console.error(`Gagal menyinkronkan status Odoo untuk ${docName}:`, errItem);
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
  // STEP 3: RE-CALIBRATE HISTORICAL DATES FROM CACHED CHATTER LOGS
  // -------------------------------------------------------------
  try {
    const allItemsWithNotes = await prisma.procurementTracking.findMany({
      where: {
        odooNotes: { not: null }
      },
      select: {
        id: true,
        tanggalList: true,
        odooNotes: true
      }
    });

    let fixedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of allItemsWithNotes) {
        if (!item.odooNotes) continue;
        try {
          const logs = JSON.parse(item.odooNotes);
          if (Array.isArray(logs) && logs.length > 0) {
            // Logs are sorted descending (newest first), so the last is the oldest
            const oldestLog = logs[logs.length - 1];
            const oldestLogDate = new Date(oldestLog.date);
            if (oldestLogDate && !isNaN(oldestLogDate.getTime())) {
              const diffMs = Math.abs(new Date(item.tanggalList).getTime() - oldestLogDate.getTime());
              if (diffMs > 12 * 60 * 60 * 1000) { // difference > 12 hours
                await tx.procurementTracking.update({
                  where: { id: item.id },
                  data: { tanggalList: oldestLogDate }
                });
                fixedCount++;
              }
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    });
    console.log(`[Sync Route] Re-calibrated ${fixedCount} historical dates from cached chatter logs.`);
  } catch (errCalibrate) {
    console.error('[Sync Route] Failed to re-calibrate historical dates:', errCalibrate);
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
}
