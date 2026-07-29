import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const requestsPath = path.join(__dirname, 'odoo-request-all.json');
  if (!fs.existsSync(requestsPath)) {
    console.error("odoo-request-all.json not found.");
    return;
  }

  const requests = JSON.parse(fs.readFileSync(requestsPath, 'utf8'));
  console.log(`Analyzing ${requests.length} requests...`);

  // Let's print 50 descriptions
  requests.slice(0, 80).forEach((r: any) => {
    console.log(`- ${r.name}: ${r.description}`);
  });
}

main();
