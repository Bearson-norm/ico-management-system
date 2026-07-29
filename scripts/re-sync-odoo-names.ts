import { PrismaClient as GaPrisma } from '../lib/generated/ga';
import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';

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
  const mtc = new MtcPrisma();
  
  let sessionId = process.argv[2] || process.env.ODOO_SESSION_ID || '';
  
  if (!sessionId) {
    try {
      const gaSettings = await ga.gaSetting.findMany();
      sessionId = gaSettings.find(s => s.key === 'ga_odoo_session_id')?.value || '';
      if (!sessionId) {
        const mtcSettings = await mtc.mtcSetting.findMany();
        sessionId = mtcSettings.find(s => s.key === 'mtc_odoo_session_id')?.value || '';
      }
    } catch (e) {
      // Ignored
    }
  }

  if (!sessionId) {
    console.error('\n[ERROR] session_id tidak ditemukan!');
    console.log('Silakan jalankan script dengan: npx ts-node --project tsconfig.scripts.json scripts/re-sync-odoo-names.ts <YOUR_SESSION_ID>\n');
    await ga.$disconnect();
    await mtc.$disconnect();
    process.exit(1);
  }

  console.log('==================================================');
  console.log('FIXING NAMA BARANG PR LAMA YANG MASIH GENERIK/ANALITIK');
  console.log('==================================================\n');

  const GENERIC_NAMES = ['EQUIPMENT', 'SPAREPARTS USAGE', 'SUPPLIES', 'FACTORY SUPPLIES', 'Barang GA', 'Produk Tanpa Nama', 'REPAIR AND MAINTENANCE', 'REPAIR & MAINTENANCE', 'MEDIA PLACEMENT', 'SPONSORSHIP', 'MARKETING SUPPLIES'];
  const ACCOUNT_NAME_PATTERNS = [
    /^SUPPLIES\s+FACTORY\s+RELATED$/i,
    /^REPAIR\s+AND\s+MAINTENANCE/i,
    /^OFFICE\s+SUPPLIES$/i,
    /^FACTORY\s+SUPPLIES$/i,
    /^GENERAL\s+SUPPLIES$/i,
    /^MAINTENANCE\s+SUPPLIES$/i,
    /^CLEANING\s+SUPPLIES$/i,
    /^CONSUMABLE/i,
    /^Barang\s+GA$/i,
    /^MEDIA\s+PLACEMENT$/i,
    /^SPONSORSHIP$/i,
  ];

  function isGenericName(name: string | null | undefined): boolean {
    if (!name) return true;
    const trimmed = name.trim();
    if (GENERIC_NAMES.some(g => trimmed.toLowerCase() === g.toLowerCase())) {
      return true;
    }
    for (const pattern of ACCOUNT_NAME_PATTERNS) {
      if (pattern.test(trimmed)) return true;
    }
    
    // All caps + 3+ words + length > 15 = likely analytical account name
    const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    const wordCount = trimmed.split(/\s+/).length;
    if (isAllCaps && wordCount >= 3 && trimmed.length > 15) {
      return true;
    }
    
    return false;
  }

  function getBestOdooLineName(line: any): string {
    const desc = line.product_description_variants;
    if (desc && !isGenericName(desc)) {
      return desc.trim();
    }
    const nameVal = line.name;
    if (nameVal && !isGenericName(nameVal)) {
      // Remove square brackets/product prefix if present, e.g., "[123] Product Description" -> "Product Description"
      const cleaned = nameVal.replace(/^\[.*?\]\s*/, '');
      if (cleaned && !isGenericName(cleaned)) {
        return cleaned.trim();
      }
    }
    if (line.product_id && Array.isArray(line.product_id) && line.product_id[1]) {
      const prodName = line.product_id[1].replace(/^\[.*?\]\s*/, '');
      if (prodName && !isGenericName(prodName)) {
        return prodName.trim();
      }
    }
    // Fallback to whatever is non-generic, or the first available
    return desc || nameVal || (line.product_id && line.product_id[1]) || 'Produk Tanpa Nama';
  }

  // ==========================================
  // BAGIAN 1: PERBAIKI DATA GA (General Affairs)
  // ==========================================
  try {
    console.log('--- PEMERIKSAAN DATA GA ---');
    const allGaRecords = await ga.gaProcurementTracking.findMany({
      where: { nomorPr: { not: null } }
    });
    const gaRecords = allGaRecords.filter(rec => isGenericName(rec.originalName));

    console.log(`Ditemukan ${gaRecords.length} record GA dengan nama generik/analitik.`);

    if (gaRecords.length > 0) {
      const prMap = new Map<string, typeof gaRecords>();
      for (const rec of gaRecords) {
        if (rec.nomorPr) {
          if (!prMap.has(rec.nomorPr)) prMap.set(rec.nomorPr, []);
          prMap.get(rec.nomorPr)!.push(rec);
        }
      }

      for (const [nomorPr, records] of prMap.entries()) {
        console.log(`\n🔍 Memproses PR GA: ${nomorPr}...`);
        
        let lines: any[] = [];
        try {
          const prs = await queryOdoo(
            odooUrl,
            sessionId,
            'purchase.request',
            'search_read',
            [[['name', '=', nomorPr]]],
            { fields: ['id'], limit: 1 }
          );

          if (prs && prs.length > 0) {
            lines = await queryOdoo(
              odooUrl,
              sessionId,
              'purchase.request.line',
              'search_read',
              [[['request_id', '=', prs[0].id]]],
              { fields: ['product_id', 'product_qty', 'estimated_cost', 'name'], limit: 50 }
            );
          } else {
            const requisitions = await queryOdoo(
              odooUrl,
              sessionId,
              'purchase.requisition',
              'search_read',
              [[['name', '=', nomorPr]]],
              { fields: ['id'], limit: 1 }
            );

            if (requisitions && requisitions.length > 0) {
              lines = await queryOdoo(
                odooUrl,
                sessionId,
                'purchase.requisition.line',
                'search_read',
                [[['requisition_id', '=', requisitions[0].id]]],
                { fields: ['product_id', 'product_qty', 'price_unit', 'product_description_variants'], limit: 50 }
              );
            }
          }

          if (lines && lines.length > 0) {
            console.log(`   Ditemukan ${lines.length} lines di Odoo.`);
            
            for (let i = 0; i < records.length; i++) {
              const rec = records[i];
              const matchedLine = lines[i] || lines[0];
              const odooDesc = getBestOdooLineName(matchedLine);
              
              if (odooDesc && !isGenericName(odooDesc) && odooDesc !== rec.originalName) {
                await ga.gaProcurementTracking.update({
                  where: { id: rec.id },
                  data: { originalName: odooDesc.trim() }
                });
                console.log(`   ✅ Update GA ID: ${rec.id} -> "${odooDesc.trim()}"`);
              }
            }
          } else {
            console.log(`   ⚠️  Tidak ada detail lines yang ditemukan di Odoo.`);
          }
        } catch (err: any) {
          console.error(`   ❌ Gagal memproses PR GA ${nomorPr}: ${err.message || err}`);
        }
      }
    }
  } catch (err: any) {
    console.error('Error saat memproses data GA:', err);
  }

  console.log('\n--------------------------------------------------\n');

  // ==========================================
  // BAGIAN 2: PERBAIKI DATA MTC (Maintenance)
  // ==========================================
  try {
    console.log('--- PEMERIKSAAN DATA MTC ---');
    const allMtcRecords = await mtc.procurementTracking.findMany({
      where: { nomorPr: { not: null } }
    });
    const mtcRecords = allMtcRecords.filter(rec => isGenericName(rec.originalName));

    console.log(`Ditemukan ${mtcRecords.length} record MTC dengan nama generik/analitik.`);

    if (mtcRecords.length > 0) {
      const prMap = new Map<string, typeof mtcRecords>();
      for (const rec of mtcRecords) {
        if (rec.nomorPr) {
          if (!prMap.has(rec.nomorPr)) prMap.set(rec.nomorPr, []);
          prMap.get(rec.nomorPr)!.push(rec);
        }
      }

      for (const [nomorPr, records] of prMap.entries()) {
        console.log(`\n🔍 Memproses PR MTC: ${nomorPr}...`);
        
        let lines: any[] = [];
        try {
          const prs = await queryOdoo(
            odooUrl,
            sessionId,
            'purchase.request',
            'search_read',
            [[['name', '=', nomorPr]]],
            { fields: ['id'], limit: 1 }
          );

          if (prs && prs.length > 0) {
            lines = await queryOdoo(
              odooUrl,
              sessionId,
              'purchase.request.line',
              'search_read',
              [[['request_id', '=', prs[0].id]]],
              { fields: ['product_id', 'product_qty', 'estimated_cost', 'name'], limit: 50 }
            );
          } else {
            const requisitions = await queryOdoo(
              odooUrl,
              sessionId,
              'purchase.requisition',
              'search_read',
              [[['name', '=', nomorPr]]],
              { fields: ['id'], limit: 1 }
            );

            if (requisitions && requisitions.length > 0) {
              lines = await queryOdoo(
                odooUrl,
                sessionId,
                'purchase.requisition.line',
                'search_read',
                [[['requisition_id', '=', requisitions[0].id]]],
                { fields: ['product_id', 'product_qty', 'price_unit', 'product_description_variants'], limit: 50 }
              );
            }
          }

          if (lines && lines.length > 0) {
            console.log(`   Ditemukan ${lines.length} lines di Odoo.`);
            for (let i = 0; i < records.length; i++) {
              const rec = records[i];
              const matchedLine = lines[i] || lines[0];
              const odooDesc = getBestOdooLineName(matchedLine);
              
              if (odooDesc && !isGenericName(odooDesc) && odooDesc !== rec.originalName) {
                await mtc.procurementTracking.update({
                  where: { id: rec.id },
                  data: { originalName: odooDesc.trim() }
                });
                console.log(`   ✅ Update MTC ID: ${rec.id} -> "${odooDesc.trim()}"`);
              }
            }
          } else {
            console.log(`   ⚠️  Tidak ada detail lines yang ditemukan di Odoo.`);
          }
        } catch (err: any) {
          console.error(`   ❌ Gagal memproses PR MTC ${nomorPr}: ${err.message || err}`);
        }
      }
    }
  } catch (err: any) {
    console.error('Error saat memproses data MTC:', err);
  }

  await ga.$disconnect();
  await mtc.$disconnect();
  console.log('\n==================================================');
  console.log('PROSES PERBAIKAN SELESAI!');
  console.log('==================================================');
}

main();
