import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

async function queryOdoo(model: string, method: string, args: any[], kwargs: any = {}, sessionId: string) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs },
    id: Math.floor(Math.random() * 10000)
  };

  const res = await fetch('https://foomx.odoo.com/web/dataset/call_kw', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${sessionId}`
    },
    body: JSON.stringify(payload)
  });

  const json: any = await res.json();
  return json.result;
}

async function main() {
  const mtc = new MtcPrisma();
  let sessionId = '';
  try {
    const settings = await mtc.mtcSetting.findMany();
    sessionId = settings.find(s => s.key === 'mtc_odoo_session_id')?.value || '';
  } catch (e) {}

  if (!sessionId) {
    console.log('No Odoo session_id found in MTC settings DB.');
    return;
  }

  console.log('=== REAL ODOO LINE ITEM FIELDS INSPECTION ===');

  // 1. Inspect recent purchase.order.line
  try {
    const poLines = await queryOdoo(
      'purchase.order.line',
      'search_read',
      [[]],
      {
        fields: ['order_id', 'product_id', 'name', 'price_unit', 'product_qty'],
        limit: 15,
        order: 'id desc'
      },
      sessionId
    );

    console.log('\n--- REAL ODOO PURCHASE.ORDER.LINE SAMPLE (15 ITEMS) ---');
    poLines.forEach((l: any, i: number) => {
      console.log(`${i + 1}. PO: ${l.order_id ? l.order_id[1] : 'N/A'}`);
      console.log(`   product_id[1] (ACTUAL PRODUCT NAME): "${Array.isArray(l.product_id) ? l.product_id[1] : l.product_id}"`);
      console.log(`   line.name     (DESCRIPTION / TAG):   "${l.name ? l.name.replace(/\n/g, ' ') : ''}"`);
      console.log(`   Qty: ${l.product_qty} | Unit Price: ${l.price_unit}`);
      console.log('---');
    });
  } catch (e) {
    console.error('Failed to query purchase.order.line:', e);
  }

  // 2. Inspect recent purchase.requisition.line
  try {
    const reqLines = await queryOdoo(
      'purchase.requisition.line',
      'search_read',
      [[]],
      {
        fields: ['requisition_id', 'product_id', 'product_qty', 'price_unit', 'product_description_variants'],
        limit: 10,
        order: 'id desc'
      },
      sessionId
    );

    console.log('\n--- REAL ODOO PURCHASE.REQUISITION.LINE SAMPLE (10 ITEMS) ---');
    reqLines.forEach((l: any, i: number) => {
      console.log(`${i + 1}. Req: ${l.requisition_id ? l.requisition_id[1] : 'N/A'}`);
      console.log(`   product_id[1] (ACTUAL PRODUCT NAME):         "${Array.isArray(l.product_id) ? l.product_id[1] : l.product_id}"`);
      console.log(`   product_description_variants (VARIANT/NOTE): "${l.product_description_variants || ''}"`);
      console.log('---');
    });
  } catch (e) {
    console.error('Failed to query purchase.requisition.line:', e);
  } finally {
    await mtc.$disconnect();
  }
}

main();
