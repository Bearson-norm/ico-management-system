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

// Mencari sparepart di DB lokal berdasarkan nama atau alias (secara eksak maupun fuzzy)
async function findMtcSparepartMatch(tx: any, prodName: string): Promise<string | null> {
  const cleanProd = prodName.toLowerCase().trim();
  if (!cleanProd) return null;

  // 1. Coba match nama secara persis (case-insensitive)
  let matched = await tx.sparepart.findFirst({
    where: { 
      aktif: true,
      nama: { equals: prodName, mode: 'insensitive' } 
    }
  });
  if (matched) return matched.id;

  // 2. Coba match namaAlias secara persis (case-insensitive)
  matched = await tx.sparepart.findFirst({
    where: {
      aktif: true,
      namaAlias: { equals: prodName, mode: 'insensitive' }
    }
  });
  if (matched) return matched.id;

  // 3. Coba match fuzzy (seperti GA) dengan list all active spareparts
  const allSpareparts = await tx.sparepart.findMany({ where: { aktif: true } });
  
  const fuzzyMatched = allSpareparts.find((sp: any) => {
    const cleanSpName = sp.nama.toLowerCase().trim();
    const cleanAlias = sp.namaAlias?.toLowerCase().trim();
    
    // Cocokkan nama sparepart
    if (cleanSpName && (cleanProd.includes(cleanSpName) || cleanSpName.includes(cleanProd))) {
      return true;
    }
    // Cocokkan alias sparepart
    if (cleanAlias && (cleanProd.includes(cleanAlias) || cleanAlias.includes(cleanProd))) {
      return true;
    }
    return false;
  });

  return fuzzyMatched ? fuzzyMatched.id : null;
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

const GENERIC_NAMES = [
  'EQUIPMENT', 'SPAREPARTS USAGE', 'SUPPLIES', 'FACTORY SUPPLIES', 'Barang GA', 'Produk Tanpa Nama',
  'REPAIR AND MAINTENANCE', 'REPAIR & MAINTENANCE', 'MEDIA PLACEMENT', 'SPONSORSHIP', 'MARKETING SUPPLIES',
  'OVERHEADS', 'OVERHEAD', 'OVERHEAD EXPENSE', 'OVERHEAD EXPENSES', 'UTILITY', 'UTILITIES',
  'DIRECT EXPENSE', 'DIRECT EXPENSES', 'INDIRECT EXPENSE', 'INDIRECT EXPENSES', 'GENERAL EXPENSE', 'GENERAL EXPENSES',
  'CONSUMABLES', 'CONSUMABLE', 'LAB CONSUMABLE', 'LAB CONSUMABLES', 'LABORATORY CONSUMABLE', 'LABORATORY CONSUMABLES',
  'LAB SUPPLIES', 'LABORATORY SUPPLIES', 'SAFETY SUPPLIES', 'SAFETY EQUIPMENT', 'OTHER EXPENSES', 'OTHER EXPENSE',
  'SERVICES', 'SERVICE', 'HARDWARE', 'TOOLS', 'TOOL'
];
const ACCOUNT_NAME_PATTERNS = [
  /^SUPPLIES\s+FACTORY\s+RELATED$/i,
  /^REPAIR\s+AND\s+MAINTENANCE/i,
  /^OFFICE\s+SUPPLIES$/i,
  /^FACTORY\s+SUPPLIES$/i,
  /^GENERAL\s+SUPPLIES$/i,
  /^MAINTENANCE\s+SUPPLIES$/i,
  /^CLEANING\s+SUPPLIES$/i,
  /^LAB(ORATORY)?\s+CONSUMABLES?$/i,
  /^LAB(ORATORY)?\s+SUPPLIES$/i,
  /^SAFETY\s+(SUPPLIES|EQUIPMENT)$/i,
  /^Barang\s+GA$/i,
  /^MEDIA\s+PLACEMENT$/i,
  /^SPONSORSHIP$/i,
  /^OVERHEADS?$/i,
  /^OVERHEAD\s+EXPENSES?$/i,
  /^UTILIT(Y|IES)$/i,
];

function isGenericName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  if (GENERIC_NAMES.some(g => lower === g.toLowerCase())) {
    return true;
  }
  for (const pattern of ACCOUNT_NAME_PATTERNS) {
    if (pattern.test(trimmed)) {
      const hasNumbers = /\d/.test(trimmed);
      if (!hasNumbers) return true;
    }
  }

  // Generic keyword match without specific specs/digits
  const genericWords = [
    'consumable', 'consumables', 'supplies', 'overhead', 'overheads',
    'utility', 'utilities', 'repair and maintenance', 'repair & maintenance',
    'equipment', 'general expense', 'direct expense', 'indirect expense'
  ];
  if (genericWords.some(w => lower.includes(w))) {
    const hasSpecificSpecs = /\d/.test(trimmed) || /uph|liter|kg|mm|cm|pack|pcs|set|unit|box|cartridge|bottle|jerigen/i.test(trimmed);
    if (!hasSpecificSpecs) {
      return true;
    }
  }

  // All caps + 3+ words + length > 15 = likely analytical account name
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const wordCount = trimmed.split(/\s+/).length;
  if (isAllCaps && wordCount >= 3 && trimmed.length > 15) {
    return true;
  }
  
  return false;
}

const NON_MTC_KEYWORDS = [
  'lollipop', 'lolipop', 'neon box', 'vapestore', 'vape store', 'wus vape', 'montir vape',
  'media placement', 'sponsorship', 'marketing supplies', 'promo', 'billboard', 'booth',
  'event', 'influencer', 'endorse', 'branding', 'flyer', 'brosur', 'banner'
];

function isNonMtcItem(name: string | null | undefined, keterangan: string | null | undefined): boolean {
  const combined = `${name || ''} ${keterangan || ''}`.toLowerCase();
  return NON_MTC_KEYWORDS.some(k => combined.includes(k));
}

function getBestOdooLineName(line: any): string {
  const variant = (line.product_description_variants || '')?.trim();
  const lineName = (line.name || '')?.trim();
  const productLabel = (Array.isArray(line.product_id) ? line.product_id[1] : '')?.trim();
  
  // 1. Prioritaskan product_description_variants jika ada dan bukan tag generic
  if (variant && !isGenericName(variant)) {
    return variant;
  }
  // 2. Jika deskripsi lineName ada dan bukan generic, serta productLabel generic (misal "OVERHEADS"), gunakan lineName (misal "Nitrogen UPH")
  if (lineName && !isGenericName(lineName) && isGenericName(productLabel)) {
    return lineName;
  }
  // 3. Gunakan nama Master Product dari product_id[1] jika bukan tag generic
  if (productLabel && !isGenericName(productLabel)) {
    return productLabel;
  }
  // 4. Gunakan deskripsi line.name jika bukan tag generic
  if (lineName && !isGenericName(lineName)) {
    return lineName;
  }
  
  return variant || lineName || productLabel || 'Produk Tanpa Nama';
}

function combinePrAndPoLinks(existingRef: string | null | undefined, newUrl: string, type: 'pr' | 'po'): string {
  let pr: string | null = null;
  let po: string | null = null;

  if (existingRef) {
    const trimmed = existingRef.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        pr = parsed.pr || null;
        po = parsed.po || null;
      } catch (e) {}
    } else if (trimmed.includes('model=purchase.order')) {
      po = trimmed;
    } else if (trimmed.includes('model=purchase.request') || trimmed.includes('model=purchase.requisition')) {
      pr = trimmed;
    }
  }

  if (type === 'pr') pr = newUrl;
  if (type === 'po') po = newUrl;

  if (pr && po) {
    return JSON.stringify({ pr, po });
  }
  return pr || po || newUrl;
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
  const odooSessionId = bodyOdooSessionId || dbSettings['mtc_odoo_session_id'] || process.env.ODOO_SESSION_ID || '';
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
                   sheetId: finalSheetId,
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
                   sheetId: finalSheetId,
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
      // 2a. Import new PRs and sync active PR lines from Odoo in batch (last 60 days for fast response)
      const thirtyDaysAgoDate = new Date();
      thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 60);
      const thirtyDaysAgoStr = thirtyDaysAgoDate.toISOString().replace('T', ' ').substring(0, 19);
      const parsedUid = parseInt(String(odooUid)) || 34;

      let importedPrCount = 0;

      // Import/Sync from purchase.requisition
      try {
        logDebug(`Mencari purchase.requisition di Odoo sejak ${thirtyDaysAgoStr} untuk UID ${parsedUid}...`);
        const reqDomain: any[] = [['create_date', '>=', thirtyDaysAgoStr]];
        if (parsedUid) {
          reqDomain.push('|');
          reqDomain.push(['user_id', '=', parsedUid]);
          reqDomain.push(['create_uid', '=', parsedUid]);
        }

        const recentRequisitions = await queryOdoo(
          'purchase.requisition',
          'search_read',
          [reqDomain],
          { fields: ['id', 'name', 'origin', 'state', 'create_date', 'description', 'user_id', 'create_uid'] },
          odooOptions
        );

        if (recentRequisitions && recentRequisitions.length > 0) {
          logDebug(`Ditemukan ${recentRequisitions.length} purchase.requisition di Odoo.`);
          
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

            const reqLines = allReqLines.filter((line: any) => line.requisition_id && line.requisition_id[0] === req.id);
            if (reqLines.length === 0) continue;

            let localItems = localMap[prName] || [];

            let localStatusPr = 'DRAFT';
            const reqState = req.state;
            if (reqState === 'in_progress') localStatusPr = 'TO_APPROVE';
            else if (reqState === 'open') localStatusPr = 'RFQ';
            else if (reqState === 'done') localStatusPr = 'RECEIVED';
            else if (reqState === 'cancel') localStatusPr = 'CANCELLED';

            const prDate = req.create_date ? new Date(req.create_date) : new Date();

            await prisma.$transaction(async (tx) => {
              for (const line of reqLines) {
                const prodName = getBestOdooLineName(line);
                if (isNonMtcItem(prodName, req.description)) continue;

                const qty = Number(line.product_qty) || 1;
                const price = Number(line.price_unit) || 0;

                // Try to find a match in local items for this PR
                let bestMatchIndex = -1;
                let bestScore = -1;

                for (let i = 0; i < localItems.length; i++) {
                  const local = localItems[i];
                  let score = 0;
                  const cleanLocalName = local.originalName.toLowerCase().trim();
                  const cleanProdName = prodName.toLowerCase().trim();

                  if (cleanLocalName === cleanProdName) {
                    score += 100;
                  } else if (cleanProdName.length > 3 && (cleanLocalName.includes(cleanProdName) || cleanProdName.includes(cleanLocalName))) {
                    score += 20;
                  }

                  if (local.qty === Math.round(qty)) {
                    score += 10;
                  }

                  if (score > bestScore) {
                    bestScore = score;
                    bestMatchIndex = i;
                  }
                }

                const sparepartId = await findMtcSparepartMatch(tx, prodName);

                const targetIndex = bestMatchIndex !== -1 ? bestMatchIndex : (localItems.length > 0 ? 0 : -1);

                if (targetIndex !== -1) {
                  // MATCH / REUSE FOUND: update existing local item in-place (no duplicates!)
                  const matchedItem = localItems[targetIndex];
                  localItems.splice(targetIndex, 1);

                  const resolvedSpId = sparepartId || matchedItem.sparepartId;
                  const updateData: any = {
                    statusPr: localStatusPr,
                    harga: price > 0 ? price : undefined,
                    qty: Math.round(qty),
                    sparepartId: resolvedSpId,
                    isStocked: resolvedSpId ? true : undefined,
                  };

                  if (isGenericName(matchedItem.originalName) && !isGenericName(prodName)) {
                    updateData.originalName = prodName;
                  }

                  if (hasActualChanges(matchedItem, updateData)) {
                    await tx.procurementTracking.update({
                      where: { id: matchedItem.id },
                      data: updateData
                    });
                  }
                } else {
                  // NO MATCH AT ALL & LOCAL LIST EMPTY: create new local item
                  await tx.procurementTracking.create({
                    data: {
                      originalName: prodName,
                      qty: Math.round(qty),
                      harga: price,
                      nomorPr: prName,
                      statusPr: localStatusPr,
                      tanggalList: prDate,
                      keterangan: req.description || null,
                      sparepartId,
                      isStocked: sparepartId ? true : false,
                      productCategory: 'Sparepart',
                      urgency: 'Normal'
                    }
                  });
                  importedPrCount++;
                }
              }
            });
          }
        }
      } catch (errReqImport) {
        console.error('Gagal mengimpor purchase.requisition baru dari Odoo:', errReqImport);
        logDebug(`Error requisition import: ${errReqImport}`);
      }

      // Import/Sync from purchase.request
      try {
        logDebug(`Mencari purchase.request di Odoo sejak ${thirtyDaysAgoStr} untuk UID ${parsedUid}...`);
        const requestDomain: any[] = [['create_date', '>=', thirtyDaysAgoStr]];
        if (parsedUid) {
          requestDomain.push('|');
          requestDomain.push(['requested_by', '=', parsedUid]);
          requestDomain.push(['create_uid', '=', parsedUid]);
        }

        const recentRequests = await queryOdoo(
          'purchase.request',
          'search_read',
          [requestDomain],
          { fields: ['id', 'name', 'state', 'create_date', 'description', 'requested_by', 'create_uid'] },
          odooOptions
        );

        if (recentRequests && recentRequests.length > 0) {
          logDebug(`Ditemukan ${recentRequests.length} purchase.request di Odoo.`);
          
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

          // Process each request
          for (const req of recentRequests) {
            const prName = req.name?.trim();
            if (!prName) continue;

            const reqLines = allReqLines.filter((line: any) => line.request_id && line.request_id[0] === req.id);
            if (reqLines.length === 0) continue;

            let localItems = localMap[prName] || [];

            let localStatusPr = 'DRAFT';
            const reqState = req.state;
            if (reqState === 'to_approve') localStatusPr = 'TO_APPROVE';
            else if (reqState === 'approved') localStatusPr = 'APPROVED';
            else if (reqState === 'rejected') localStatusPr = 'CANCELLED';
            else if (reqState === 'done') localStatusPr = 'RECEIVED';

            const prDate = req.create_date ? new Date(req.create_date) : new Date();

            await prisma.$transaction(async (tx) => {
              for (const line of reqLines) {
                const prodName = getBestOdooLineName(line);
                const qty = Number(line.product_qty) || 1;
                const price = Number(line.estimated_cost) || 0;

                // Try to find a match in local items for this PR
                let bestMatchIndex = -1;
                let bestScore = -1;

                for (let i = 0; i < localItems.length; i++) {
                  const local = localItems[i];
                  let score = 0;
                  const cleanLocalName = local.originalName.toLowerCase().trim();
                  const cleanProdName = prodName.toLowerCase().trim();

                  if (cleanLocalName === cleanProdName) {
                    score += 100;
                  } else if (cleanProdName.length > 3 && (cleanLocalName.includes(cleanProdName) || cleanProdName.includes(cleanLocalName))) {
                    score += 20;
                  }

                  if (local.qty === Math.round(qty)) {
                    score += 10;
                  }

                  if (score > bestScore) {
                    bestScore = score;
                    bestMatchIndex = i;
                  }
                }

                const sparepartId = await findMtcSparepartMatch(tx, prodName);

                const isMatchValid = bestMatchIndex !== -1 && (
                  bestScore >= 20 ||
                  (bestScore >= 10 && isGenericName(localItems[bestMatchIndex].originalName))
                );

                if (isMatchValid) {
                  // MATCH FOUND: update existing local item
                  const matchedItem = localItems[bestMatchIndex];
                  localItems.splice(bestMatchIndex, 1);

                  const resolvedSpId = sparepartId || matchedItem.sparepartId;
                  const updateData: any = {
                    statusPr: localStatusPr,
                    harga: price > 0 ? price : undefined,
                    qty: Math.round(qty),
                    sparepartId: resolvedSpId,
                    isStocked: resolvedSpId ? true : undefined,
                  };

                  if (isGenericName(matchedItem.originalName) && !isGenericName(prodName)) {
                    updateData.originalName = prodName;
                  }

                  if (hasActualChanges(matchedItem, updateData)) {
                    await tx.procurementTracking.update({
                      where: { id: matchedItem.id },
                      data: updateData
                    });
                  }
                } else {
                  // NO MATCH: create new local item
                  await tx.procurementTracking.create({
                    data: {
                      originalName: prodName,
                      qty: Math.round(qty),
                      harga: price,
                      nomorPr: prName,
                      statusPr: localStatusPr,
                      tanggalList: prDate,
                      keterangan: line.name || null,
                      sparepartId,
                      isStocked: sparepartId ? true : false,
                      productCategory: 'Sparepart',
                      urgency: 'Normal'
                    }
                  });
                  importedPrCount++;
                }
              }
            });
          }
        }
      } catch (errReqImport) {
        console.error('Gagal mengimpor purchase.request baru dari Odoo:', errReqImport);
        logDebug(`Error request import: ${errReqImport}`);
      }

      const checkDaysAgo = new Date();
      checkDaysAgo.setDate(checkDaysAgo.getDate() - 90);

      // Find all active tracking items that have a PR or PO number,
      // are relatively recent (list date within the last 90 days),
      // and are not yet complete (or missing vendor/notes).
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
              tanggalList: { gte: checkDaysAgo }
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
      const fetchOdooDataForGroup = async (docName: string, prNo: string | undefined, poNo: string | undefined) => {
        logDebug(`PO Search for document ${docName} -> poNo: ${poNo}, prNo: ${prNo}`);
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
            limit: 50
          },
          odooOptions
        );

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
                  ? new RegExp('(PR|RFQ)[/0-9-]*0*' + seq + '\\\\b', 'i')
                  : new RegExp('(?:\\\\D|^)0*' + seq + '\\\\b', 'i');

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
          logDebug(`PO not found for ${docName}. Falling back to purchase.requisition/request query for ${prOrDocName}...`);
          try {
            const matchedPR = await findOdooPR(prOrDocName, odooOptions);
            if (matchedPR) {
              return { isPrOnly: true, matchedPR };
            }
          } catch (errPR) {
            console.error(`Gagal mencari PR fallback Odoo untuk ${docName}:`, errPR);
          }
          return null;
        }

        // We found POs! Gather all PO lines and logs
        const allPoLines: any[] = [];
        const allLogs: any[] = [];
        let prCreateDate: Date | null = null;
        const poGrStatusMap = new Map<number, { isGrDone: boolean, odooGrDate: Date | null, odooGrLink: string | null }>();

        for (const odooPo of odooPos) {
          const poId = odooPo.id;
          const poName = odooPo.name;
          const odooState = odooPo.state;
          const localStatusPr = mapOdooStateToLocal(odooState);
          const vendorName = Array.isArray(odooPo.partner_id) ? odooPo.partner_id[1] : null;
          const amountTotal = odooPo.amount_total || 0;

          // Fetch PO logs, lines, and GRs in parallel (highly optimized!)
          const [poLogs, poLines, odooGrs] = await Promise.all([
            fetchChatterLogs('purchase.order', poId, 'PO', odooOptions).catch(() => []),
            queryOdoo(
              'purchase.order.line',
              'search_read',
              [[['order_id', '=', poId]]],
              {
                fields: ['name', 'price_unit', 'price_subtotal', 'price_total', 'product_qty', 'qty_received', 'product_id'],
                limit: 50
              },
              odooOptions
            ).catch(() => []),
            queryOdoo(
              'good.received',
              'search_read',
              [[['purchase_id', '=', poId]]],
              {
                fields: ['id', 'state', 'write_date', 'name'],
                order: 'id desc',
                limit: 1
              },
              odooOptions
            ).catch(() => [])
          ]);

          allLogs.push(...poLogs);

          for (const line of poLines) {
            line.parentPoName = poName;
            line.parentPoId = poId;
            line.parentPoState = odooState;
            line.parentLocalStatusPr = localStatusPr;
            line.parentVendorName = vendorName;
            line.parentAmountTotal = amountTotal;
          }
          allPoLines.push(...poLines);

          let odooGrDate: Date | null = null;
          let isGrDone = false;
          let odooGrLink: string | null = null;

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
          poGrStatusMap,
          prCreateDate,
          chatterNotes
        };
      };

      // Query Odoo data for all groups in parallel (massively speeds up sync!)
      logDebug(`Starting parallel Odoo fetches for ${Object.keys(groupedItems).length} documents...`);
      const fetchPromises = Object.keys(groupedItems).map(async (docName) => {
        const items = groupedItems[docName];
        const representativeItem = items[0];
        const prNo = representativeItem.nomorPr?.trim();
        const poNo = representativeItem.nomorPo?.trim();
        try {
          const data = await fetchOdooDataForGroup(docName, prNo, poNo);
          return { docName, items, data, error: null };
        } catch (err) {
          return { docName, items, data: null, error: err };
        }
      });

      const odooResults = await Promise.all(fetchPromises);
      logDebug(`Finished parallel Odoo fetches. Processing database updates...`);

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
          const reqId = matchedPR.id;
          const reqState = matchedPR.state;
          const isRequisition = matchedPR.model === 'purchase.requisition';
          const localStatusPr = isRequisition
            ? (reqState === 'in_progress' ? 'TO_APPROVE' : reqState === 'open' ? 'RFQ' : reqState === 'done' ? 'APPROVED' : reqState === 'cancel' ? 'CANCELLED' : 'DRAFT')
            : (reqState === 'to_approve' ? 'TO_APPROVE' : reqState === 'approved' ? 'APPROVED' : reqState === 'rejected' ? 'CANCELLED' : reqState === 'done' ? 'PO' : 'DRAFT');

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
                limit: 50
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

            for (const item of items) {
              let matchedPrice = 0;
              let matchedQty = 0;
              let matchedLine = null;
              if (prLines && prLines.length > 0) {
                matchedLine = findBestMatchedLine(prLines, item);
                if (matchedLine) {
                  matchedPrice = matchedLine[priceField] || 0;
                  matchedQty = matchedLine.product_qty || 0;
                }
              }

              const reqId = matchedPR.id;
              const odooPrUrl = `https://foomx.odoo.com/web#id=${reqId}&model=${matchedPR.model || 'purchase.request'}&view_type=form`;

              const updateData: any = {
                statusPr: localStatusPr,
                odooNotes: chatterNotes || null,
                linkReferences: combinePrAndPoLinks(item.linkReferences, odooPrUrl, 'pr')
              };
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
              if (matchedPrice > 0) {
                updateData.harga = matchedPrice;
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
        } else {
          // PO update
          const { odooPos, allPoLines, poGrStatusMap, prCreateDate, chatterNotes } = data;

          await prisma.$transaction(async (tx) => {
            for (const item of items) {
              let matchedLine = null;
              if (allPoLines.length > 0) {
                matchedLine = findBestMatchedLine(allPoLines, item);
              }

              // If item doesn't match any PO line, skip PO assignment for this item
              if (!matchedLine) {
                // Only update non-PO fields (notes, date) for unmatched items
                const unlinkedUpdate: any = {
                  odooNotes: chatterNotes || null,
                };
                if (prCreateDate) {
                  unlinkedUpdate.tanggalList = prCreateDate;
                }
                if (hasActualChanges(item, unlinkedUpdate)) {
                  await tx.procurementTracking.update({
                    where: { id: item.id },
                    data: unlinkedUpdate
                  });
                }
                continue;
              }

              const targetPo = odooPos.find((p: any) => p.id === matchedLine.parentPoId)
                || odooPos[0];
              const poId = targetPo.id;
              const poName = targetPo.name;
              const odooState = targetPo.state;
              const localStatusPr = mapOdooStateToLocal(odooState);
              const vendorName = Array.isArray(targetPo.partner_id) ? targetPo.partner_id[1] : null;
              const amountTotal = targetPo.amount_total || 0;
              const odooPoUrl = `https://foomx.odoo.com/web#id=${poId}&model=purchase.order&view_type=form`;

              const grStatus = poGrStatusMap.get(poId) || { isGrDone: false, odooGrDate: null, odooGrLink: null };
              const { isGrDone, odooGrDate, odooGrLink } = grStatus;

              let matchedPrice = 0;
              let matchedQty = matchedLine ? Number(matchedLine.product_qty) || 0 : 0;
              let qtyReceived = matchedLine ? Number(matchedLine.qty_received) || 0 : 0;

              if (matchedLine) {
                const priceTotal = Number(matchedLine.price_total) || 0;
                const priceUnit = Number(matchedLine.price_unit) || 0;
                if (priceTotal > 0 && matchedQty > 0) {
                  // Gunakan harga total inkl. PPN 11% dibagi Qty
                  matchedPrice = priceTotal / matchedQty;
                } else if (priceUnit > 0) {
                  matchedPrice = priceUnit * 1.11; // 11% PPN fallback
                }
              }

              const updateData: any = {
                statusPr: localStatusPr,
                nomorPo: poName,
                odooNotes: chatterNotes || null,
              };
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

              if (matchedPrice > 0) {
                updateData.harga = matchedPrice;
              } else if (amountTotal > 0 && (!item.harga || Number(item.harga) === 0)) {
                updateData.harga = amountTotal;
              }

              // Hitung jumlah qty yang sudah di-GR sebelumnya untuk item ini
              const siblingItems = await tx.procurementTracking.findMany({
                where: {
                  nomorPo: poName,
                  originalName: item.originalName,
                  nomorPr: item.nomorPr
                }
              });

              const alreadyReceivedQty = siblingItems
                .filter((sib: any) => sib.statusPo === 'DONE' && sib.id !== item.id)
                .reduce((sum: number, sib: any) => sum + sib.qty, 0);

              const newReceiptQty = qtyReceived - alreadyReceivedQty;
              let finalIsGrDone = isGrDone;

              // Check if Odoo shows this is a partial delivery line (some received, but not all)
              const isPartialOdooGr = !!(matchedLine && qtyReceived > 0 && qtyReceived < matchedQty);

              // Set final fixed quantity & price from PO line (PO line in Odoo defines final agreed qty & price)
              if (matchedQty > 0) {
                updateData.qty = Math.round(matchedQty);
              }

              if (newReceiptQty > 0 && newReceiptQty < item.qty) {
                // SPLIT GR HANDLING: Baru diterima sebagian dari porsi pending saat ini
                updateData.qty = newReceiptQty;
                updateData.statusPo = 'DONE';
                if (odooGrDate) updateData.tanggalTerima = odooGrDate;
                if (odooGrLink) updateData.linkGr = odooGrLink;
                finalIsGrDone = true;

                const remainingQty = item.qty - newReceiptQty;
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
                    linkReferences: odooPoUrl,
                    vendor: vendorName || item.vendor,
                    harga: matchedPrice > 0 ? matchedPrice : item.harga,
                    nomorPr: item.nomorPr,
                    statusPr: localStatusPr,
                    statusPo: localStatusPr === 'APPROVED' ? 'PO' : localStatusPr,
                    nomorPo: poName,
                    odooNotes: chatterNotes || null,
                    linkedPartsJson: item.linkedPartsJson
                  }
                });
                logDebug(`Split GR untuk Item ID ${item.id}: ${newReceiptQty} diterima baru (updated), ${remainingQty} sisa pending (created)`);
              } else if (newReceiptQty >= item.qty || (newReceiptQty > 0 && isGrDone && !isPartialOdooGr)) {
                // Porsi pending saat ini sudah terisi penuh atau PO secara keseluruhan selesai
                updateData.statusPo = 'DONE';
                updateData.tanggalTerima = odooGrDate || item.tanggalTerima || new Date();
                if (odooGrLink) {
                  updateData.linkGr = odooGrLink;
                }
                finalIsGrDone = true;
              } else {
                // If newReceiptQty <= 0, it means it is not received in Odoo (either because it is pending or because total PO qty has been fully allocated to other items).
                // Revert/keep as PO (not DONE), but preserve physical receipt date if already recorded in MTC
                updateData.statusPo = 'PO';
                updateData.tanggalTerima = item.tanggalTerima || null;
                if (odooGrLink) {
                  updateData.linkGr = odooGrLink;
                }
              }

              const hasChanges = hasActualChanges(item, updateData);
              let updatedItem: any = item;

              if (hasChanges) {
                updatedItem = await tx.procurementTracking.update({
                  where: { id: item.id },
                  data: updateData
                });

                if (updatedItem.sparepartId) {
                  const spUpdate: any = {
                    purchasingStatus: finalIsGrDone ? 'NONE' : localStatusPr,
                    purchasingNoPr: finalIsGrDone ? null : updatedItem.nomorPr,
                    purchasingNoPo: finalIsGrDone ? null : updatedItem.nomorPo,
                    odooNotes: updatedItem.odooNotes,
                    purchasingQty: finalIsGrDone ? 0 : updatedItem.qty,
                    ...(matchedPrice > 0 ? { harga: matchedPrice } : {})
                  };

                  if (finalIsGrDone) {
                    const sp = await tx.sparepart.findUnique({ where: { id: updatedItem.sparepartId } });
                    if (sp) {
                      if (odooGrDate) {
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

                      // Auto-create StockMovement IN if GR is done in Odoo and no StockMovement IN exists yet
                      const existingMov = await tx.stockMovement.findFirst({
                        where: {
                          sparepartId: sp.id,
                          tipe: 'IN',
                          OR: [
                            { keterangan: { contains: updatedItem.nomorPo ? `PO: ${updatedItem.nomorPo}` : 'Penerimaan' } },
                            { keterangan: { contains: updatedItem.nomorPr ? `PR: ${updatedItem.nomorPr}` : 'Penerimaan' } }
                          ]
                        }
                      });

                      if (!existingMov) {
                        const tDate = odooGrDate || updatedItem.tanggalTerima || new Date();
                        const movHarga = matchedPrice > 0 ? matchedPrice : (Number(updatedItem.harga) || Number(sp.harga) || 0);
                        await tx.stockMovement.create({
                          data: {
                            tipe: 'IN',
                            sparepartId: sp.id,
                            namaItem: sp.nama,
                            qty: updatedItem.qty,
                            harga: movHarga,
                            lokasi: sp.lokasi,
                            purchaseType: 'PO',
                            vendor: vendorName || updatedItem.vendor || null,
                            keterangan: `[Odoo Sync Penerimaan PR: ${updatedItem.nomorPr || '—'} / PO: ${updatedItem.nomorPo || '—'}]`,
                            tanggal: tDate,
                          }
                        });

                        if (!updatedItem.isStocked) {
                          await tx.procurementTracking.update({
                            where: { id: updatedItem.id },
                            data: { isStocked: true }
                          });
                        }
                      }
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
  // Special handling: if a PR was cancelled then re-submitted, use the date
  // AFTER the last cancellation event as tanggalList, not the very oldest log.
  // This prevents lead time from being inflated by the pre-cancellation history.
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

    // Keywords that indicate a cancellation event in chatter body/subtype
    const CANCEL_KEYWORDS = ['cancel', 'dibatalkan', 'batal', 'refused', 'ditolak', 'rejected'];

    function isCancelLog(log: any): boolean {
      const body = (log.body || '').toLowerCase();
      const subtype = (log.subtype || '').toLowerCase();
      return CANCEL_KEYWORDS.some(k => body.includes(k) || subtype.includes(k));
    }

    let fixedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of allItemsWithNotes) {
        if (!item.odooNotes) continue;
        try {
          const logs = JSON.parse(item.odooNotes);
          if (!Array.isArray(logs) || logs.length === 0) continue;

          // Logs are sorted descending (newest first).
          // Find the most recent cancellation event (if any).
          let lastCancelIdx = -1;
          for (let i = 0; i < logs.length; i++) {
            if (isCancelLog(logs[i])) {
              lastCancelIdx = i;
              break; // found most recent cancel (logs are newest-first)
            }
          }

          let targetDate: Date | null = null;

          if (lastCancelIdx > 0) {
            // There was a cancellation AND there are newer logs after it (index < lastCancelIdx).
            // Use the oldest log that is NEWER than the last cancellation event.
            // That is: logs[lastCancelIdx - 1] is the first log after the last cancel.
            // But we want the OLDEST post-cancel log → that's logs[0] if lastCancelIdx > 0,
            // actually we want the newest log that is still older than the cancel.
            // Strategy: take the log at index (lastCancelIdx - 1) going towards 0;
            // the oldest among those is at index 0 (newest log overall, already past cancel).
            // More accurately: post-cancel logs are indices 0..(lastCancelIdx-1), oldest of these
            // is at index (lastCancelIdx - 1).
            const postCancelOldestLog = logs[lastCancelIdx - 1];
            const d = new Date(postCancelOldestLog.date);
            if (!isNaN(d.getTime())) {
              targetDate = d;
            }
          }

          // Fallback: no cancellation found → use the absolute oldest log
          if (!targetDate) {
            const oldestLog = logs[logs.length - 1];
            const d = new Date(oldestLog.date);
            if (!isNaN(d.getTime())) {
              targetDate = d;
            }
          }

          if (targetDate) {
            const diffMs = Math.abs(new Date(item.tanggalList).getTime() - targetDate.getTime());
            if (diffMs > 12 * 60 * 60 * 1000) { // difference > 12 hours
              await tx.procurementTracking.update({
                where: { id: item.id },
                data: { tanggalList: targetDate }
              });
              fixedCount++;
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    });
    console.log(`[Sync Route] Re-calibrated ${fixedCount} historical dates from cached chatter logs (cancel-aware).`);
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
