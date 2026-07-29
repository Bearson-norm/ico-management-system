import { PrismaClient as GaPrisma } from '../lib/generated/ga';

async function queryOdoo(
  odooUrl: string,
  sessionId: string,
  model: string,
  method: string,
  args: any[],
  kwargs: any = {}
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

  const res = await fetch(`${odooUrl}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${sessionId}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`HTTP Error! Status: ${res.status}`);
  }

  const json: any = await res.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }

  return json.result;
}

async function main() {
  const odooUrl = 'https://foomx.odoo.com';
  const ga = new GaPrisma();
  
  let sessionId = process.argv[2] || process.env.ODOO_SESSION_ID || '';
  if (!sessionId) {
    const gaSettings = await ga.gaSetting.findMany();
    sessionId = gaSettings.find(s => s.key === 'ga_odoo_session_id')?.value || '';
  }

  if (!sessionId) {
    console.error('Session ID not found!');
    process.exit(1);
  }

  try {
    console.log('Fetching purchase.order.line fields...');
    const result = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.order.line',
      'fields_get',
      [],
      { attributes: ['string', 'type'] }
    );

    console.log('Total fields:', Object.keys(result).length);
    const targetFields = ['qty_received', 'qty_invoiced', 'product_qty', 'price_unit', 'product_id', 'name'];
    
    for (const f of targetFields) {
      console.log(`Field "${f}":`, result[f] || 'NOT FOUND');
    }
  } catch (e: any) {
    console.error('Error:', e.message || e);
  } finally {
    await ga.$disconnect();
  }
}

main();
