import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// Helper untuk query Odoo via JSON-RPC dengan Cookie session_id
async function queryOdoo(
  model: string,
  method: string,
  args: any[],
  kwargs: any = {},
  sessionId: string
) {
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
      'Cookie': `session_id=${sessionId}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000) // 15 seconds timeout
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

// POST /api/ga/odoo/sync
export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Graceful if empty
  }

  // Fetch settings from database as fallback
  let dbSettings: Record<string, string> = {};
  try {
    const settingsList = await prismaGa.gaSetting.findMany();
    dbSettings = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);
  } catch (dbErr) {
    console.error('Failed to load GA settings from database:', dbErr);
  }

  const odooSessionId = body.odooSessionId || dbSettings['ga_odoo_session_id'] || process.env.ODOO_SESSION_ID || '';
  const odooUid = body.odooUid || (dbSettings['ga_odoo_uid'] ? parseInt(dbSettings['ga_odoo_uid']) : null) || process.env.ODOO_UID || 34;

  if (!odooSessionId) {
    return err('Cookie session_id Odoo diperlukan untuk melakukan sinkronisasi.', 400);
  }


  const parsedUid = Number(odooUid) || 34;

  try {
    // -----------------------------------------------------------------
    // LANGKAH 1: PERBARUI INFO VENDOR DARI ODOO UNTUK PESANAN AKTIF
    // Sync tidak pernah otomatis menerima barang — admin yang selalu klik Terima.
    // Langkah ini hanya mengambil nama vendor dari PO di Odoo untuk melengkapi data.
    // -----------------------------------------------------------------
    const activeTrackingItems = await prismaGa.gaProcurementTracking.findMany({
      where: { status: 'ORDERED' },
    });

    // Grouping by docName (nomorPo || nomorPr) to minimize network requests
    const grouped: { [docName: string]: typeof activeTrackingItems } = {};
    for (const item of activeTrackingItems) {
      const doc = item.nomorPo || item.nomorPr;
      if (!doc) continue;
      if (!grouped[doc]) grouped[doc] = [];
      grouped[doc].push(item);
    }

    let vendorUpdatedCount = 0;

    for (const docName of Object.keys(grouped)) {
      const items = grouped[docName];

      try {
        // Cari PO di Odoo untuk mendapatkan info vendor
        const odooPos = await queryOdoo(
          'purchase.order',
          'search_read',
          [[
            '|', '|',
            ['name', '=', docName],
            ['origin', '=', docName],
            ['partner_ref', '=', docName]
          ]],
          {
            fields: ['id', 'name', 'state', 'partner_id'],
            limit: 1
          },
          odooSessionId
        );

        if (odooPos && odooPos.length > 0) {
          const vendorName = Array.isArray(odooPos[0].partner_id) ? odooPos[0].partner_id[1] : null;

          if (vendorName) {
            // Hanya update vendor, tanpa mengubah status atau membuat stok movement
            for (const item of items) {
              if (!item.vendor) {
                await prismaGa.gaProcurementTracking.update({
                  where: { id: item.id },
                  data: { vendor: vendorName },
                });
                vendorUpdatedCount++;
              }
            }
          }
        }
      } catch (errDoc) {
        console.error(`Gagal mengambil info vendor dari Odoo untuk ${docName}:`, errDoc);
      }
    }


    // -----------------------------------------------------------------
    // LANGKAH 1b: CEK GR ODOO UNTUK ITEM YANG SUDAH DITERIMA MANUAL (grDone=false)
    // Barang yang sudah diterima admin secara manual tapi GR di Odoo belum terkonfirmasi
    // Sinkronisasi ini hanya mengupdate flag grDone tanpa membuat stok movement duplikat
    // -----------------------------------------------------------------
    const pendingGrItems = await prismaGa.gaProcurementTracking.findMany({
      where: { status: 'RECEIVED', grDone: false },
    });

    let grConfirmedCount = 0;

    if (pendingGrItems.length > 0) {
      // Kelompokkan berdasarkan nomor dokumen
      const grGrouped: { [docName: string]: typeof pendingGrItems } = {};
      for (const item of pendingGrItems) {
        const doc = item.nomorPo || item.nomorPr;
        if (!doc) continue;
        if (!grGrouped[doc]) grGrouped[doc] = [];
        grGrouped[doc].push(item);
      }

      for (const docName of Object.keys(grGrouped)) {
        const items = grGrouped[docName];
        try {
          // Cari PO di Odoo
          const odooPos = await queryOdoo(
            'purchase.order',
            'search_read',
            [[
              '|', '|',
              ['name', '=', docName],
              ['origin', '=', docName],
              ['partner_ref', '=', docName]
            ]],
            { fields: ['id', 'name', 'state'], limit: 1 },
            odooSessionId
          );

          if (odooPos && odooPos.length > 0) {
            const poId = odooPos[0].id;

            // Cek GR di Odoo
            const odooGrs = await queryOdoo(
              'good.received',
              'search_read',
              [[['purchase_id', '=', poId]]],
              { fields: ['id', 'state'], limit: 1 },
              odooSessionId
            );

            const grDoneInOdoo = odooGrs && odooGrs.length > 0 && odooGrs[0].state === 'done';

            if (grDoneInOdoo) {
              // Update grDone menjadi true — stok sudah masuk dari penerimaan manual, tidak perlu buat duplikat
              await prismaGa.gaProcurementTracking.updateMany({
                where: { id: { in: items.map((i) => i.id) } },
                data: { grDone: true },
              });
              grConfirmedCount += items.length;
            }
          }
        } catch (errGr) {
          console.error(`Gagal cek GR Odoo untuk dokumen ${docName}:`, errGr);
        }
      }
    }

    // -----------------------------------------------------------------
    // LANGKAH 2: IMPOR PR BARU DARI ODOO BERDASARKAN KATA KUNCI GA
    // -----------------------------------------------------------------
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    const fortyFiveDaysAgoStr = fortyFiveDaysAgo.toISOString().replace('T', ' ').substring(0, 19);

    let importedPrCount = 0;

    // Impor dari purchase.requisition (PR Requisition Odoo)
    try {
      const requisitions = await queryOdoo(
        'purchase.requisition',
        'search_read',
        [[
          ['create_date', '>=', fortyFiveDaysAgoStr],
          ['create_uid', '=', parsedUid],
          '|', '|',
          ['description', 'ilike', 'ga'],
          ['description', 'ilike', 'general affairs'],
          ['description', 'ilike', 'cikupa']
        ]],
        { fields: ['id', 'name', 'create_date', 'description'] },
        odooSessionId
      );

      if (requisitions && requisitions.length > 0) {
        for (const req of requisitions) {
          const prName = req.name?.trim();
          if (!prName) continue;

          // Periksa apakah PR ini sudah diimpor secara lokal
          const exists = await prismaGa.gaProcurementTracking.count({
            where: { nomorPr: prName },
          });

          if (exists === 0) {
            // Tarik line items dari PR tersebut
            const lines = await queryOdoo(
              'purchase.requisition.line',
              'search_read',
              [[['requisition_id', '=', req.id]]],
              { fields: ['product_id', 'product_qty', 'price_unit', 'name'], limit: 50 },
              odooSessionId
            );

            if (lines && lines.length > 0) {
              const prDate = req.create_date ? new Date(req.create_date) : new Date();

              await prismaGa.$transaction(async (tx) => {
                for (const line of lines) {
                  const prodName = Array.isArray(line.product_id) ? line.product_id[1] : (line.name || 'Barang GA');
                  const qty = Number(line.product_qty) || 1;
                  const price = Number(line.price_unit) || 0;

                  // Coba cocokkan ke master barang GA
                  let itemId: string | null = null;
                  const matchedItem = await tx.gaItem.findFirst({
                    where: { nama: { equals: prodName, mode: 'insensitive' } },
                  });
                  if (matchedItem) {
                    itemId = matchedItem.id;
                  }

                  await tx.gaProcurementTracking.create({
                    data: {
                      originalName: prodName,
                      itemId,
                      qty,
                      harga: price,
                      nomorPr: prName,
                      status: 'ORDERED',
                      tanggalPesan: prDate,
                      isStocked: true,
                      keterangan: req.description || line.name || null,
                    },
                  });
                }
              });
              importedPrCount++;
            }
          }
        }
      }
    } catch (errReq) {
      console.error('Gagal mengimpor Requisitions dari Odoo:', errReq);
    }

    // Impor dari purchase.request (PR Request Odoo)
    try {
      const requests = await queryOdoo(
        'purchase.request',
        'search_read',
        [[
          ['create_date', '>=', fortyFiveDaysAgoStr],
          ['create_uid', '=', parsedUid],
          '|', '|',
          ['description', 'ilike', 'ga'],
          ['description', 'ilike', 'general affairs'],
          ['description', 'ilike', 'cikupa']
        ]],
        { fields: ['id', 'name', 'create_date', 'description'] },
        odooSessionId
      );

      if (requests && requests.length > 0) {
        for (const req of requests) {
          const prName = req.name?.trim();
          if (!prName) continue;

          const exists = await prismaGa.gaProcurementTracking.count({
            where: { nomorPr: prName },
          });

          if (exists === 0) {
            const lines = await queryOdoo(
              'purchase.request.line',
              'search_read',
              [[['request_id', '=', req.id]]],
              { fields: ['product_id', 'product_qty', 'estimated_cost', 'name'], limit: 50 },
              odooSessionId
            );

            if (lines && lines.length > 0) {
              const prDate = req.create_date ? new Date(req.create_date) : new Date();

              await prismaGa.$transaction(async (tx) => {
                for (const line of lines) {
                  const prodName = Array.isArray(line.product_id) ? line.product_id[1] : (line.name || 'Barang GA');
                  const qty = Number(line.product_qty) || 1;
                  const price = Number(line.estimated_cost) || 0;

                  let itemId: string | null = null;
                  const matchedItem = await tx.gaItem.findFirst({
                    where: { nama: { equals: prodName, mode: 'insensitive' } },
                  });
                  if (matchedItem) {
                    itemId = matchedItem.id;
                  }

                  await tx.gaProcurementTracking.create({
                    data: {
                      originalName: prodName,
                      itemId,
                      qty,
                      harga: price,
                      nomorPr: prName,
                      status: 'ORDERED',
                      tanggalPesan: prDate,
                      isStocked: true,
                      keterangan: req.description || line.name || null,
                    },
                  });
                }
              });
              importedPrCount++;
            }
          }
        }
      }
    } catch (errReq) {
      console.error('Gagal mengimpor Requests dari Odoo:', errReq);
    }

    return ok({
      msg: 'Sinkronisasi Odoo selesai!',
      data: {
        vendorUpdatedCount,
        grConfirmedCount,
        importedPrCount,
      },
    });
  } catch (e: any) {
    console.error('[POST /api/ga/odoo/sync]', e);
    return err(`Gagal sinkronisasi Odoo: ${e.message}`, 500);
  }
}
