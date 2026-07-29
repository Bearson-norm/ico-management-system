import { PrismaClient as MtcPrisma } from '../lib/generated/mtc';
import { PrismaClient as GaPrisma } from '../lib/generated/ga';

async function main() {
  const odooUrl = 'https://foomx.odoo.com'; // Odoo instance URL
  
  const mtc = new MtcPrisma();
  const ga = new GaPrisma();
  
  let sessionId = process.argv[2] || process.env.ODOO_SESSION_ID || '';
  
  if (!sessionId) {
    try {
      console.log('Mencari session_id dari database settings...');
      
      // Coba cari di GA Settings
      const gaSettings = await ga.gaSetting.findMany();
      const gaSession = gaSettings.find(s => s.key === 'ga_odoo_session_id')?.value;
      
      if (gaSession) {
        sessionId = gaSession;
        console.log(`Menemukan session_id dari GA settings: ${sessionId.substring(0, 8)}...`);
      } else {
        // Coba cari di MTC Settings
        const mtcSettings = await mtc.mtcSetting.findMany();
        const mtcSession = mtcSettings.find(s => s.key === 'mtc_odoo_session_id')?.value;
        if (mtcSession) {
          sessionId = mtcSession;
          console.log(`Menemukan session_id dari MTC settings: ${sessionId.substring(0, 8)}...`);
        }
      }
    } catch (e) {
      console.log('Info: Gagal memuat database settings (mungkin server DB tidak menyala atau belum di-migrate).');
    } finally {
      await mtc.$disconnect();
      await ga.$disconnect();
    }
  }

  if (!sessionId) {
    console.error('\n[ERROR] session_id tidak ditemukan!');
    console.log('\nSilakan jalankan script dengan memberikan session_id sebagai argumen:');
    console.log('npx ts-node --project tsconfig.scripts.json scripts/check-odoo-session.ts <YOUR_SESSION_ID>\n');
    process.exit(1);
  }

  console.log(`\nMelakukan request ke ${odooUrl}/web/session/get_session_info (dan fallback jika 404)...`);

  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {},
      id: Math.floor(Math.random() * 10000)
    };

    let res = await fetch(`${odooUrl}/web/session/get_session_info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${sessionId}`
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 404) {
      console.log('Endpoint /web/session/get_session_info return 404, mencoba fallback ke /web/session/info...');
      res = await fetch(`${odooUrl}/web/session/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `session_id=${sessionId}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      throw new Error(`HTTP Error! Status: ${res.status}`);
    }

    const json: any = await res.json();
    if (json.error) {
      throw new Error(`Odoo Error: ${JSON.stringify(json.error)}`);
    }

    const result = json.result;
    console.log('\n======================================');
    console.log('     SESSION INFO ODOO BERHASIL       ');
    console.log('======================================');
    console.log('Database Name (db)  :', result.db);
    console.log('User ID (uid)       :', result.uid);
    console.log('Name                :', result.name);
    console.log('Username (email)    :', result.username);
    console.log('Company Name        :', result.company_name || 'N/A');
    console.log('Server Version      :', result.server_version || 'N/A');
    console.log('--------------------------------------');
    console.log('Detail lengkap session:');
    console.dir(result, { depth: null });

  } catch (error: any) {
    console.error('\nGagal memanggil session info:', error.message || error);
  }
}

main();
