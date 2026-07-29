import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const reqsPath = path.join(__dirname, 'odoo-requisition-all.json');
  const requestsPath = path.join(__dirname, 'odoo-request-all.json');

  if (fs.existsSync(reqsPath)) {
    const requisitions = JSON.parse(fs.readFileSync(reqsPath, 'utf8'));
    console.log(`Requisitions: ${requisitions.length} records.`);
    
    // Let's count some fields
    const stateCounts: Record<string, number> = {};
    const creatorCounts: Record<string, number> = {};
    const descSample: string[] = [];

    for (const r of requisitions) {
      stateCounts[r.state] = (stateCounts[r.state] || 0) + 1;
      
      const desc = r.description || '';
      if (desc && desc.toLowerCase().includes('ga') || desc.toLowerCase().includes('general affairs')) {
        descSample.push(`${r.name}: ${desc}`);
      }
    }

    console.log("Requisition states:", stateCounts);
    console.log(`Requisitions with 'ga' in description: ${descSample.length}`);
    console.log("Sample descriptions with 'ga':");
    descSample.slice(0, 10).forEach(d => console.log(`- ${d.substring(0, 120)}`));
  } else {
    console.log("odoo-requisition-all.json not found.");
  }
}

main();
