import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parse } from 'csv-parse/sync';

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
      // 5 seconds timeout
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }

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
      // 5 seconds timeout
      signal: AbortSignal.timeout(5000)
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

// POST /api/mtc/odoo/sync
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Graceful if empty body
  }

  const { sheetUrl, odooPassword: bodyOdooPassword, odooDb: bodyOdooDb, odooUid: bodyOdooUid, odooSessionId: bodyOdooSessionId } = body;
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
              // If status is WAITING_PRICE and procurement has now filled the price in Sheets
              let finalStatusPr = statusPr;
              let finalHarga = harga || (trackingItem.harga ? Number(trackingItem.harga) : 0);

              if (trackingItem.statusPr === 'WAITING_PRICE' && harga > 0) {
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
                const isPriceUpdate = trackingItem.statusPr === 'WAITING_PRICE' && harga > 0;
                
                await tx.sparepart.update({
                  where: { id: trackingItem.sparepartId },
                  data: {
                    ...(isPriceUpdate ? {
                      harga: finalHarga,
                      purchasingStatus: 'READY_ODOO',
                    } : {}),
                    ...(nomorPr ? { purchasingNoPr: nomorPr } : {}),
                    ...(nomorPo ? { purchasingNoPo: nomorPo } : {}),
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
                  tanggalList: tanggalList || trackingItem.tanggalList,
                  qty: qty || trackingItem.qty,
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
                  statusPr,
                  statusPa,
                  statusPo,
                  nomorPo,
                  etaFoom,
                  linkGr,
                  tanggalTerima,
                }
              });
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
  const odooPassword = bodyOdooPassword || process.env.ODOO_PASSWORD || '';
  const odooSessionId = bodyOdooSessionId || process.env.ODOO_SESSION_ID || '';
  const odooDb = bodyOdooDb || 'foom-production-5808833';
  const odooUid = bodyOdooUid || 34;

  const odooOptions = { odooPassword, odooDb, odooUid, odooSessionId };

  if (!odooPassword && !odooSessionId) {
    odooMessage = 'Sinkronisasi Odoo dilewati (Kredensial Odoo tidak dikonfigurasi).';
  } else {
    try {
      // Find all active tracking items that have a PR or PO number and are not yet complete
      const trackingItems = await prisma.procurementTracking.findMany({
        where: {
          OR: [
            { nomorPr: { not: null } },
            { nomorPo: { not: null } },
          ],
          NOT: {
            statusPo: 'DONE'
          }
        },
        include: {
          sparepart: true
        }
      });

      let updatedOdooCount = 0;

      for (const item of trackingItems) {
        const prNo = item.nomorPr?.trim();
        const poNo = item.nomorPo?.trim();
        const docName = poNo || prNo;

        if (!docName) continue;

        try {
          // 1. Search for PO/RFQ in Odoo matching name, origin, or partner_ref (Vendor Reference)
          const odooPos = await queryOdoo(
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
              fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order', 'origin', 'partner_ref'],
              limit: 1
            },
            odooOptions
          );

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

            // Fetch specific PO Line Item Price & Details
            let matchedPrice = 0;
            try {
              const poLines = await queryOdoo(
                'purchase.order.line',
                'search_read',
                [[['order_id', '=', poId]]],
                {
                  fields: ['name', 'price_unit', 'product_qty', 'product_id'],
                  limit: 50
                },
                odooOptions
              );

              if (poLines && poLines.length > 0) {
                const odooItemName = item.sparepart?.nama?.toLowerCase();
                const originalName = item.originalName.toLowerCase();
                
                const matchedLine = poLines.find((line: any) => {
                  const lineName = line.name?.toLowerCase() || '';
                  const prodName = Array.isArray(line.product_id) ? line.product_id[1]?.toLowerCase() : '';
                  return (
                    (odooItemName && (lineName.includes(odooItemName) || prodName.includes(odooItemName))) ||
                    lineName.includes(originalName) ||
                    originalName.includes(lineName)
                  );
                });

                if (matchedLine) {
                  matchedPrice = matchedLine.price_unit || 0;
                }
              }
            } catch (errLines) {
              console.error(`Gagal mengambil detail line item PO ${poName}:`, errLines);
            }

            // Fetch PR logs if origin is present
            if (originDoc) {
              try {
                // Try purchase.requisition
                const odooReqs = await queryOdoo(
                  'purchase.requisition',
                  'search_read',
                  [[['name', '=', originDoc]]],
                  { fields: ['id'], limit: 1 },
                  odooOptions
                );

                if (odooReqs && odooReqs.length > 0) {
                  const prLogs = await fetchChatterLogs('purchase.requisition', odooReqs[0].id, 'PR', odooOptions);
                  combinedLogs.push(...prLogs);
                } else {
                  // Try purchase.request
                  const odooRequests = await queryOdoo(
                    'purchase.request',
                    'search_read',
                    [[['name', '=', originDoc]]],
                    { fields: ['id'], limit: 1 },
                    odooOptions
                  );
                  if (odooRequests && odooRequests.length > 0) {
                    const prLogs = await fetchChatterLogs('purchase.request', odooRequests[0].id, 'PR', odooOptions);
                    combinedLogs.push(...prLogs);
                  }
                }
              } catch (errOrigin) {
                console.error(`Gagal mengambil log asal PR untuk PO ${poName}:`, errOrigin);
              }
            }

            // Also check if the db item's nomorPr is different and try to fetch its logs directly
            if (prNo && prNo !== originDoc) {
              try {
                // Try purchase.requisition
                const odooReqs = await queryOdoo(
                  'purchase.requisition',
                  'search_read',
                  [[['name', '=', prNo]]],
                  { fields: ['id'], limit: 1 },
                  odooOptions
                );

                if (odooReqs && odooReqs.length > 0) {
                  const prLogs = await fetchChatterLogs('purchase.requisition', odooReqs[0].id, 'PR', odooOptions);
                  combinedLogs.push(...prLogs);
                } else {
                  // Try purchase.request
                  const odooRequests = await queryOdoo(
                    'purchase.request',
                    'search_read',
                    [[['name', '=', prNo]]],
                    { fields: ['id'], limit: 1 },
                    odooOptions
                  );
                  if (odooRequests && odooRequests.length > 0) {
                    const prLogs = await fetchChatterLogs('purchase.request', odooRequests[0].id, 'PR', odooOptions);
                    combinedLogs.push(...prLogs);
                  }
                }
              } catch (errPrNo) {
                console.error(`Gagal mengambil log prNo direct untuk PO ${poName}:`, errPrNo);
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

            // 3. Update locally
            await prisma.$transaction(async (tx) => {
              // Direct Odoo PO URL
              const odooPoUrl = `https://foomx.odoo.com/web#id=${poId}&model=purchase.order&view_type=form`;

              // Update tracking item
              const updateData: any = {
                statusPr: localStatusPr,
                nomorPo: poName,
                odooNotes: chatterNotes || null,
              };
              if (vendorName && !item.vendor) updateData.vendor = vendorName;
              
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

              const updatedItem = await tx.procurementTracking.update({
                where: { id: item.id },
                data: updateData
              });

              // Propagate to master Spareparts DB
              if (updatedItem.sparepartId) {
                await tx.sparepart.update({
                  where: { id: updatedItem.sparepartId },
                  data: {
                    purchasingStatus: localStatusPr,
                    purchasingNoPr: updatedItem.nomorPr,
                    purchasingNoPo: updatedItem.nomorPo,
                    odooNotes: updatedItem.odooNotes,
                    // Also propagate unit price to master DB if fetched from PO line
                    ...(matchedPrice > 0 ? { harga: matchedPrice } : {})
                  }
                });
              }
            });

            updatedOdooCount++;
          } else {
            // Document not found in purchase.order. Try purchase.requisition.
            try {
              const odooReqs = await queryOdoo(
                'purchase.requisition',
                'search_read',
                [[['name', '=', docName]]],
                {
                  fields: ['id', 'name', 'state'],
                  limit: 1
                },
                odooOptions
              );

              if (odooReqs && odooReqs.length > 0) {
                const odooReq = odooReqs[0];
                const reqId = odooReq.id;
                const reqState = odooReq.state; // e.g. draft, in_progress, open, done, cancel
                let localStatusPr = 'DRAFT';
                if (reqState === 'in_progress') localStatusPr = 'TO_APPROVE';
                else if (reqState === 'open') localStatusPr = 'RFQ';
                else if (reqState === 'done') localStatusPr = 'APPROVED';
                else if (reqState === 'cancel') localStatusPr = 'CANCELLED';

                const prLogs = await fetchChatterLogs('purchase.requisition', reqId, 'PR', odooOptions);
                prLogs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const chatterNotes = prLogs.length > 0 ? JSON.stringify(prLogs) : '';

                // Fetch requisition lines to extract the price
                let matchedPrice = 0;
                try {
                  const prLines = await queryOdoo(
                    'purchase.requisition.line',
                    'search_read',
                    [[['requisition_id', '=', reqId]]],
                    {
                      fields: ['product_id', 'product_qty', 'price_unit'],
                      limit: 50
                    },
                    odooOptions
                  );

                  if (prLines && prLines.length > 0) {
                    const odooItemName = item.sparepart?.nama?.toLowerCase();
                    const originalName = item.originalName.toLowerCase();

                    const matchedLine = prLines.find((line: any) => {
                      const prodName = Array.isArray(line.product_id) ? line.product_id[1]?.toLowerCase() : '';
                      return (
                        (odooItemName && prodName.includes(odooItemName)) ||
                        originalName.includes(prodName) ||
                        prodName.includes(originalName)
                      );
                    });

                    if (matchedLine) {
                      matchedPrice = matchedLine.price_unit || 0;
                    }
                  }
                } catch (errReqLines) {
                  console.error(`Gagal mengambil detail line item PR Requisition ${docName}:`, errReqLines);
                }

                await prisma.$transaction(async (tx) => {
                  const updateData: any = {
                    statusPr: localStatusPr,
                    odooNotes: chatterNotes || null
                  };
                  if (matchedPrice > 0) {
                    updateData.harga = matchedPrice;
                  }

                  const updatedItem = await tx.procurementTracking.update({
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
                        ...(matchedPrice > 0 ? { harga: matchedPrice } : {})
                      }
                    });
                  }
                });
                updatedOdooCount++;
              } else {
                // Try purchase.request (Purchase Request fallback)
                try {
                  const odooRequests = await queryOdoo(
                    'purchase.request',
                    'search_read',
                    [[['name', '=', docName]]],
                    {
                      fields: ['id', 'name', 'state'],
                      limit: 1
                    },
                    odooOptions
                  );

                  if (odooRequests && odooRequests.length > 0) {
                    const odooReq = odooRequests[0];
                    const reqId = odooReq.id;
                    const reqState = odooReq.state; // e.g. draft, to_approve, approved, rejected, done
                    let localStatusPr = 'DRAFT';
                    if (reqState === 'to_approve') localStatusPr = 'TO_APPROVE';
                    else if (reqState === 'approved') localStatusPr = 'APPROVED';
                    else if (reqState === 'rejected') localStatusPr = 'CANCELLED';
                    else if (reqState === 'done') localStatusPr = 'PO';

                    const prLogs = await fetchChatterLogs('purchase.request', reqId, 'PR', odooOptions);
                    prLogs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const chatterNotes = prLogs.length > 0 ? JSON.stringify(prLogs) : '';

                    // Fetch request lines to extract the estimated cost
                    let matchedPrice = 0;
                    try {
                      const prLines = await queryOdoo(
                        'purchase.request.line',
                        'search_read',
                        [[['request_id', '=', reqId]]],
                        {
                          fields: ['product_id', 'product_qty', 'estimated_cost'],
                          limit: 50
                        },
                        odooOptions
                      );

                      if (prLines && prLines.length > 0) {
                        const odooItemName = item.sparepart?.nama?.toLowerCase();
                        const originalName = item.originalName.toLowerCase();

                        const matchedLine = prLines.find((line: any) => {
                          const prodName = Array.isArray(line.product_id) ? line.product_id[1]?.toLowerCase() : '';
                          return (
                            (odooItemName && prodName.includes(odooItemName)) ||
                            originalName.includes(prodName) ||
                            prodName.includes(originalName)
                          );
                        });

                        if (matchedLine) {
                          matchedPrice = matchedLine.estimated_cost || 0;
                        }
                      }
                    } catch (errReqLines) {
                      console.error(`Gagal mengambil detail line item PR Request ${docName}:`, errReqLines);
                    }

                    await prisma.$transaction(async (tx) => {
                      const updateData: any = {
                        statusPr: localStatusPr,
                        odooNotes: chatterNotes || null
                      };
                      if (matchedPrice > 0) {
                        updateData.harga = matchedPrice;
                      }

                      const updatedItem = await tx.procurementTracking.update({
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
                            ...(matchedPrice > 0 ? { harga: matchedPrice } : {})
                          }
                        });
                      }
                    });
                    updatedOdooCount++;
                  }
                } catch (errRequest) {
                  console.error(`Gagal melacak purchase.request Odoo untuk ${docName}:`, errRequest);
                }
              }
            } catch (errReq) {
              console.error(`Gagal melacak purchase.requisition Odoo untuk ${docName}:`, errReq);
            }
          }
        } catch (errItem) {
          console.error(`Gagal menyinkronkan status Odoo untuk ${docName}:`, errItem);
        }
      }

      odooSynced = true;
      odooMessage = `Berhasil melacak status & Chatter dari ${updatedOdooCount} dokumen Odoo Cloud.`;
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
}
