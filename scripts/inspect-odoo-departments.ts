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
    console.log("Fetching 500 recent purchase requests...");
    const requests = await queryOdoo(
      odooUrl,
      sessionId,
      'purchase.request',
      'search_read',
      [[]],
      {
        fields: ['id', 'name', 'dept', 'department_id', 'description', 'create_uid'],
        limit: 500,
        order: 'create_date desc'
      }
    );

    const depts = new Map<string, number>();
    const deptIds = new Map<string, number>();
    const creators = new Map<string, number>();

    for (const r of requests) {
      if (r.dept) depts.set(r.dept, (depts.get(r.dept) || 0) + 1);
      if (r.department_id) deptIds.set(r.department_id[1], (deptIds.get(r.department_id[1]) || 0) + 1);
      if (r.create_uid) creators.set(r.create_uid[1], (creators.get(r.create_uid[1]) || 0) + 1);
    }

    console.log("\nUnique depts (selection):");
    console.log(Array.from(depts.entries()));

    console.log("\nUnique department_ids (many2one):");
    console.log(Array.from(deptIds.entries()));

    console.log("\nUnique creators:");
    console.log(Array.from(creators.entries()));

    const nonFalseDepts = requests.filter((r: any) => r.department_id || r.dept);
    console.log(`\nRequests with non-false department info: ${nonFalseDepts.length} / ${requests.length}`);
    nonFalseDepts.slice(0, 10).forEach((r: any) => {
      console.log(`- ${r.name}: dept=${r.dept}, department_id=${JSON.stringify(r.department_id)}, desc=${r.description}`);
    });

  } catch (e: any) {
    console.error("Error occurred:", e.message || e);
    if (e.stack) console.error(e.stack);
  }
}

main();
