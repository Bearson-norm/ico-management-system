import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const reqsPath = path.join(__dirname, 'odoo-requisition-all.json');
  if (!fs.existsSync(reqsPath)) {
    console.error("odoo-requisition-all.json not found.");
    return;
  }

  const requisitions = JSON.parse(fs.readFileSync(reqsPath, 'utf8'));
  console.log(`Analyzing ${requisitions.length} requisitions...`);

  const warehouses = new Map<string, number>();
  const pickingTypes = new Map<string, number>();
  const creators = new Map<string, number>();
  const users = new Map<string, number>();

  for (const r of requisitions) {
    if (r.warehouse_id) {
      const wh = r.warehouse_id[1];
      warehouses.set(wh, (warehouses.get(wh) || 0) + 1);
    }
    if (r.picking_type_id) {
      const pt = r.picking_type_id[1];
      pickingTypes.set(pt, (pickingTypes.get(pt) || 0) + 1);
    }
    if (r.create_uid) {
      const cr = r.create_uid[1];
      creators.set(cr, (creators.get(cr) || 0) + 1);
    }
    if (r.user_id) {
      const u = r.user_id[1];
      users.set(u, (users.get(u) || 0) + 1);
    }
  }

  console.log("\nWarehouses:");
  Array.from(warehouses.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`- [${v}x] ${k}`));

  console.log("\nPicking Types:");
  Array.from(pickingTypes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`- [${v}x] ${k}`));

  console.log("\nCreators (create_uid):");
  Array.from(creators.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`- [${v}x] ${k}`));

  console.log("\nUsers (user_id):");
  Array.from(users.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`- [${v}x] ${k}`));
}

main();
