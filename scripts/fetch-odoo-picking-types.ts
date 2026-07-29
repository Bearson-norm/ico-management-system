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
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
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
    console.error("Session ID not found.");
    return;
  }

  try {
    console.log("Fetching picking types from Odoo...");
    const pickingTypes = await queryOdoo(
      odooUrl,
      sessionId,
      'stock.picking.type',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'code', 'warehouse_id'] }
    );

    console.log(`Found ${pickingTypes.length} picking types:`);
    pickingTypes.forEach((pt: any) => {
      console.log(`- ID: ${pt.id} | Name: ${pt.name} | Code: ${pt.code} | WH: ${JSON.stringify(pt.warehouse_id)}`);
    });

  } catch (e: any) {
    console.error("Error occurred:", e.message || e);
  }
}

main();
