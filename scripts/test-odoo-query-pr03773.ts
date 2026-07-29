const ODOO_SESSION_ID = 'a63c41331eacbddc78421b46e350282af18ee085';
const ODOO_URL = 'https://foomx.odoo.com/web/dataset/call_kw';

async function queryOdoo(model: string, method: string, args: any[], kwargs: any = {}) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model,
      method,
      args,
      kwargs
    },
    id: Math.floor(Math.random() * 1000000)
  };

  const response = await fetch(ODOO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${ODOO_SESSION_ID}`
    },
    body: JSON.stringify(payload)
  });

  const json: any = await response.json();
  if (json.error) {
    throw new Error(JSON.stringify(json.error));
  }
  return json.result;
}

async function main() {
  const docName = 'PR03773';
  
  console.log("1. Querying purchase.order for origin / name =", docName);
  const pos = await queryOdoo(
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
    }
  );
  console.log("POs found:", JSON.stringify(pos, null, 2));

  for (const po of pos) {
    console.log(`\n2. Fetching PO lines for: ${po.name} (id: ${po.id})`);
    const lines = await queryOdoo(
      'purchase.order.line',
      'search_read',
      [[['order_id', '=', po.id]]],
      {
        fields: ['name', 'price_unit', 'product_qty', 'qty_received', 'product_id'],
        limit: 50
      }
    );
    console.log("PO Lines:", JSON.stringify(lines, null, 2));

    console.log(`\n3. Fetching GR (good.received) for PO: ${po.name}`);
    const grs = await queryOdoo(
      'good.received',
      'search_read',
      [[['purchase_id', '=', po.id]]],
      {
        fields: ['id', 'name', 'state', 'write_date'],
        limit: 10
      }
    );
    console.log("GRs:", JSON.stringify(grs, null, 2));
  }
}

main().catch(console.error);
