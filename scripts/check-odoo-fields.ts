import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
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
    console.error("Session ID not found in database settings.");
    process.exit(1);
  }

  try {
    console.log("Fetching one requisition to inspect fields...");
    const requisitions = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.requisition',
      'search_read',
      [[]],
      { limit: 1, order: 'create_date desc' }
    );
    console.log("Requisition fields:", Object.keys(requisitions[0]));
    console.log("Requisition sample:", JSON.stringify(requisitions[0], null, 2));

    console.log("\nFetching one request to inspect fields...");
    const requests = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.request',
      'search_read',
      [[]],
      { limit: 1, order: 'create_date desc' }
    );
    console.log("Request fields:", Object.keys(requests[0]));
    console.log("Request sample:", JSON.stringify(requests[0], null, 2));
  } catch (e) {
    console.error(e);
  }
}

main();
