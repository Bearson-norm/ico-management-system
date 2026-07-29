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
    params: { model, method, args, kwargs },
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

  if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
  const json: any = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error, null, 2));
  return json.result;
}

async function main() {
  const odooUrl = 'https://foomx.odoo.com';
  const ga = new GaPrisma();
  
  let sessionId = '';
  try {
    const gaSettings = await ga.gaSetting.findMany();
    sessionId = gaSettings.find(s => s.key === 'ga_odoo_session_id')?.value || '';
  } catch (e) {
    console.error(e);
  } finally {
    await ga.$disconnect();
  }

  if (!sessionId) {
    console.error("Session ID not found in database settings.");
    process.exit(1);
  }

  try {
    console.log("Fetching 20 recent requisitions...");
    const requisitions = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition',
      'search_read',
      [[]],
      {
        fields: ['id', 'name', 'create_date', 'description', 'user_id', 'create_uid'],
        limit: 20,
        order: 'create_date desc'
      }
    );

    const reqIds = requisitions.map((r: any) => r.id);
    const lines = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition.line',
      'search_read',
      [[['requisition_id', 'in', reqIds]]],
      { fields: ['requisition_id', 'product_id', 'product_qty', 'name'] }
    );

    console.log("\nRequisitions with Line Items:");
    for (const req of requisitions) {
      console.log(`\n🔹 Requisition: ${req.name} | Date: ${req.create_date}`);
      console.log(`   User: ${JSON.stringify(req.user_id)} | Creator: ${JSON.stringify(req.create_uid)}`);
      console.log(`   Description: ${req.description}`);
      
      const reqLines = lines.filter((l: any) => l.requisition_id && l.requisition_id[0] === req.id);
      for (const line of reqLines) {
        console.log(`     - [Qty: ${line.product_qty}] Prod: ${JSON.stringify(line.product_id)} | Desc: ${line.name}`);
      }
    }

  } catch (e: any) {
    console.error("Error occurred:", e.message || e);
    if (e.stack) console.error(e.stack);
  }
}

main();
