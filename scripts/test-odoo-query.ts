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
  const docName = 'PR04196';
  
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
  console.log("Exact PO Matches:", JSON.stringify(pos, null, 2));

  console.log("\n2. Fuzzy querying purchase.order for seq = 4196");
  const seq = '4196';
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
    }
  );
  console.log("Fuzzy PO Matches count:", fuzzyPos.length);
  const seqRegex = /(PR|RFQ)[/0-9-]*0*4196\b/i;
  const filtered = fuzzyPos.filter((po: any) => {
    const name = po.name || '';
    const origin = po.origin || '';
    const partnerRef = po.partner_ref || '';
    return seqRegex.test(name) || seqRegex.test(origin) || seqRegex.test(partnerRef) || name.includes(docName);
  });
  console.log("Filtered Fuzzy PO Matches:", JSON.stringify(filtered, null, 2));

  if (filtered.length > 0) {
    for (const po of filtered) {
      console.log(`\n3. Fetching PO lines for: ${po.name} (id: ${po.id})`);
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
    }
  }
}

main().catch(console.error);
