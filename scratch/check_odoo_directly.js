const { PrismaClient } = require('../lib/generated/mtc/index.js');
const https = require('https');
const prisma = new PrismaClient();

function xmlrpcCall(host, path, method, params) {
  return new Promise((resolve, reject) => {
    function serializeParam(p) {
      if (p === null || p === undefined) return '<value><boolean>0</boolean></value>';
      if (typeof p === 'boolean') return `<value><boolean>${p ? 1 : 0}</boolean></value>`;
      if (typeof p === 'number') {
        if (Number.isInteger(p)) return `<value><int>${p}</int></value>`;
        return `<value><double>${p}</double></value>`;
      }
      if (typeof p === 'string') {
        const escaped = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<value><string>${escaped}</string></value>`;
      }
      if (Array.isArray(p)) {
        const items = p.map(serializeParam).join('');
        return `<value><array><data>${items}</data></array></value>`;
      }
      if (typeof p === 'object') {
        const members = Object.keys(p).map(k => `<member><name>${k}</name>${serializeParam(p[k])}</member>`).join('');
        return `<value><struct>${members}</struct></value>`;
      }
      return `<value><string>${String(p)}</string></value>`;
    }

    const paramsXml = params.map(p => `<param>${serializeParam(p)}</param>`).join('');
    const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramsXml}</params></methodCall>`;

    const req = https.request({
      hostname: host,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.includes('<fault>')) {
          reject(new Error(data));
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const settingsRes = await prisma.mtcSetting.findMany({
    where: { key: { startsWith: 'mtc_odoo' } }
  });
  const settings = {};
  settingsRes.forEach(s => settings[s.key] = s.value);

  const db = settings.mtc_odoo_db || 'foom-production-5808833';
  const uid = parseInt(settings.mtc_odoo_uid) || 34;
  const password = settings.mtc_odoo_password;

  console.log('Odoo DB:', db, 'UID:', uid, 'Password exists:', !!password);

  const host = 'foomx.odoo.com';

  const prsToCheck = ['PR04566', 'PR03381', 'PR02337', 'PR00948', 'PR00198'];
  const posToCheck = ['P10217', 'P06447', 'P04346'];

  try {
    const rawXmlPr = await xmlrpcCall(host, '/xmlrpc/2/object', 'execute_kw', [
      db, uid, password,
      'purchase.request', 'search_read',
      [[['name', 'in', prsToCheck]]],
      { fields: ['id', 'name', 'state', 'line_ids'] }
    ]);
    console.log('\n--- PURCHASE REQUEST RESULTS FROM ODOO ---');
    const matchesPr = [...rawXmlPr.matchAll(/<member><name>name<\/name><value><string>(.*?)<\/string><\/value><\/member>[\s\S]*?<member><name>state<\/name><value><string>(.*?)<\/string><\/value><\/member>/g)];
    for (const m of matchesPr) {
      console.log(`PR in Odoo: Name=${m[1]}, State=${m[2]}`);
    }
  } catch (err) {
    console.error('Error fetching purchase.request:', err.message);
  }

  try {
    const rawXmlPo = await xmlrpcCall(host, '/xmlrpc/2/object', 'execute_kw', [
      db, uid, password,
      'purchase.order', 'search_read',
      [[['name', 'in', posToCheck]]],
      { fields: ['id', 'name', 'origin', 'state', 'partner_id', 'picking_ids'] }
    ]);
    console.log('\n--- PURCHASE ORDER RESULTS FROM ODOO ---');
    const matchesPo = [...rawXmlPo.matchAll(/<member><name>name<\/name><value><string>(.*?)<\/string><\/value><\/member>[\s\S]*?<member><name>state<\/name><value><string>(.*?)<\/string><\/value><\/member>/g)];
    for (const m of matchesPo) {
      console.log(`PO in Odoo: Name=${m[1]}, State=${m[2]}`);
    }
  } catch (err) {
    console.error('Error fetching purchase.order:', err.message);
  }
}

main().finally(() => prisma.$disconnect());
