const https = require('https');

const sessionId = 'a63c41331eacbddc78421b46e350282af18ee085';

function callOdooWeb(model, method, args, kwargs = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method,
        args,
        kwargs
      },
      id: Date.now()
    });

    const req = https.request({
      hostname: 'foomx.odoo.com',
      path: '/web/dataset/call_kw',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${sessionId}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(parsed.error);
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('--- SEARCHING ODOO FOR PRs ---');
  const prs = ['PR04566', 'PR03381', 'PR02337', 'PR00948', 'PR00198'];
  
  try {
    const prResults = await callOdooWeb('purchase.request', 'search_read', [
      [['name', 'in', prs]]
    ], {
      fields: ['id', 'name', 'state', 'line_ids']
    });
    console.log('Purchase Request results from Odoo:\n', JSON.stringify(prResults, null, 2));

    for (const pr of prResults) {
      if (pr.line_ids && pr.line_ids.length > 0) {
        const lines = await callOdooWeb('purchase.request.line', 'search_read', [
          [['id', 'in', pr.line_ids]]
        ], {
          fields: ['id', 'name', 'product_id', 'product_qty', 'purchase_lines']
        });
        console.log(`\nLines for ${pr.name}:`, JSON.stringify(lines, null, 2));
      }
    }
  } catch (err) {
    console.error('Error fetching PRs from Odoo:', err);
  }

  console.log('\n--- SEARCHING ODOO FOR POs ---');
  const pos = ['P10217', 'P06447', 'P04346'];
  try {
    const poResults = await callOdooWeb('purchase.order', 'search_read', [
      ['|', ['name', 'in', pos], ['origin', 'in', prs]]
    ], {
      fields: ['id', 'name', 'origin', 'state', 'partner_id', 'order_line', 'picking_ids']
    });
    console.log('Purchase Order results from Odoo:\n', JSON.stringify(poResults, null, 2));

    for (const po of poResults) {
      if (po.order_line && po.order_line.length > 0) {
        const lines = await callOdooWeb('purchase.order.line', 'search_read', [
          [['id', 'in', po.order_line]]
        ], {
          fields: ['id', 'name', 'product_id', 'product_qty', 'qty_received', 'state']
        });
        console.log(`\nLines for PO ${po.name} (Origin: ${po.origin}, State: ${po.state}):\n`, JSON.stringify(lines, null, 2));
      }

      // Check Goods Received / Receipts in Odoo
      const grs = await callOdooWeb('good.received', 'search_read', [
        [['purchase_id', '=', po.id]]
      ], {
        fields: ['id', 'name', 'state', 'date_done', 'purchase_id']
      });
      console.log(`Goods Received (GR) for PO ${po.name}:`, JSON.stringify(grs, null, 2));
    }
  } catch (err) {
    console.error('Error fetching POs from Odoo:', err);
  }
}

main();
