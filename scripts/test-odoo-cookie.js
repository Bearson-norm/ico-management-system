/**
 * Script Uji Coba Koneksi Odoo via Cookie Session ID (Dengan Fitur Pencarian)
 * 
 * Cara Menjalankan untuk melihat 5 PO terbaru:
 * node scripts/test-odoo-cookie.js <SESSION_ID_KAMU>
 * 
 * Cara Menjalankan untuk mencari dokumen spesifik (PR/PO/RFQ):
 * node scripts/test-odoo-cookie.js <SESSION_ID_KAMU> <NOMOR_DOKUMEN>
 * 
 * Contoh:
 * node scripts/test-odoo-cookie.js abcdef1234567890abcdef1234567890 P13763
 * node scripts/test-odoo-cookie.js abcdef1234567890abcdef1234567890 PR/2026/05/0010
 */

const sessionId = process.argv[2];
const searchQuery = process.argv[3];

if (!sessionId) {
  console.error("\x1b[31mError: Silakan masukkan session_id dari cookie Odoo Anda!\x1b[0m");
  console.log("\nCara menjalankan script:");
  console.log("  node scripts/test-odoo-cookie.js \x1b[36m<SESSION_ID_ANDA> [NOMOR_DOKUMEN]\x1b[0m\n");
  process.exit(1);
}

// Helper untuk melakukan query ke Odoo
async function queryOdoo(model, method, args, kwargs = {}) {
  const response = await fetch("https://foomx.odoo.com/web/dataset/call_kw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `session_id=${sessionId}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs }
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  
  return json.result;
}

async function run() {
  console.log("\x1b[33m[1/3] Terhubung ke Odoo Cloud...\x1b[0m");
  
  try {
    // Jalankan tes koneksi dasar dulu
    const testResult = await queryOdoo("purchase.order", "search_read", [[]], { fields: ["name"], limit: 1 });
    console.log("\x1b[32m✓ Koneksi Sukses!\x1b[0m");
    
    if (searchQuery) {
      const doc = searchQuery.trim();
      console.log(`\n\x1b[33m[2/3] Mencari dokumen "${doc}" di berbagai model Odoo...\x1b[0m\n`);
      
      // 1. Cari di purchase.order (PO / RFQ)
      console.log(`🔍 [Mencari di purchase.order (PO/RFQ)]...`);
      try {
        const poResults = await queryOdoo(
          "purchase.order",
          "search_read",
          [[
            "|",
            ["name", "=", doc],
            ["origin", "=", doc]
          ]],
          {
            fields: ["id", "name", "state", "amount_total", "partner_id", "date_order", "origin"],
            limit: 3
          }
        );
        
        if (poResults && poResults.length > 0) {
          console.log(`  \x1b[32m✓ Ditemukan di purchase.order!\x1b[0m`);
          poResults.forEach(po => {
            console.log(`    - ID Odoo   : ${po.id}`);
            console.log(`    - Nomor PO  : \x1b[36m${po.name}\x1b[0m`);
            console.log(`    - Status    : ${po.state}`);
            console.log(`    - Total     : Rp ${po.amount_total?.toLocaleString("id-ID") || 0}`);
            console.log(`    - Vendor    : ${Array.isArray(po.partner_id) ? po.partner_id[1] : po.partner_id || "—"}`);
            console.log(`    - Origin    : ${po.origin || "—"}`);
            console.log(`-----------------------------------------------`);
          });
        } else {
          console.log(`  ❌ Tidak ditemukan di purchase.order.`);
        }
      } catch (err) {
        console.error(`  ❌ Gagal mencari di purchase.order:`, err.message);
      }

      // 2. Cari di purchase.requisition (PR Requisition)
      console.log(`\n🔍 [Mencari di purchase.requisition (PR / Tender)]...`);
      try {
        const reqResults = await queryOdoo(
          "purchase.requisition",
          "search_read",
          [[["name", "=", doc]]],
          { fields: ["id", "name", "state", "user_id"], limit: 3 }
        );
        
        if (reqResults && reqResults.length > 0) {
          console.log(`  \x1b[32m✓ Ditemukan di purchase.requisition!\x1b[0m`);
          reqResults.forEach(r => {
            console.log(`    - ID Odoo   : ${r.id}`);
            console.log(`    - Nomor PR  : \x1b[36m${r.name}\x1b[0m`);
            console.log(`    - Status    : ${r.state}`);
            console.log(`    - Pembuat   : ${Array.isArray(r.user_id) ? r.user_id[1] : "—"}`);
            console.log(`-----------------------------------------------`);
          });
        } else {
          console.log(`  ❌ Tidak ditemukan di purchase.requisition.`);
        }
      } catch (err) {
        console.error(`  ❌ Gagal mencari di purchase.requisition:`, err.message);
      }

      // 3. Cari di purchase.request (Purchase Request Fallback)
      console.log(`\n🔍 [Mencari di purchase.request (PR Request)]...`);
      try {
        const requestResults = await queryOdoo(
          "purchase.request",
          "search_read",
          [[["name", "=", doc]]],
          { fields: ["id", "name", "state", "requested_by"], limit: 3 }
        );
        
        if (requestResults && requestResults.length > 0) {
          console.log(`  \x1b[32m✓ Ditemukan di purchase.request!\x1b[0m`);
          requestResults.forEach(r => {
            console.log(`    - ID Odoo   : ${r.id}`);
            console.log(`    - Nomor PR  : \x1b[36m${r.name}\x1b[0m`);
            console.log(`    - Status    : ${r.state}`);
            console.log(`    - Pembuat   : ${Array.isArray(r.requested_by) ? r.requested_by[1] : "—"}`);
            console.log(`-----------------------------------------------`);
          });
        } else {
          console.log(`  ❌ Tidak ditemukan di purchase.request.`);
        }
      } catch (err) {
        console.error(`  ❌ Gagal mencari di purchase.request:`, err.message);
      }

      console.log(`\n\x1b[33m[3/3] Selesai melakukan pencarian dokumen.\x1b[0m`);
      
    } else {
      // Tampilkan 5 PO terbaru jika tidak ada pencarian spesifik
      console.log("\n\x1b[32m🎉 KONEKSI BERHASIL! Menarik 5 data PO teratas:\x1b[0m");
      console.log("------------------------------------------------------------------");
      const recentPos = await queryOdoo("purchase.order", "search_read", [[]], {
        fields: ["name", "state", "date_order"],
        limit: 5
      });
      
      recentPos.forEach((po, index) => {
        console.log(`[${index + 1}] Nomor PO : \x1b[36m${po.name || "—"}\x1b[0m`);
        console.log(`    Status    : ${po.state || "—"}`);
        console.log(`    Tanggal   : ${po.date_order || "—"}`);
        console.log("------------------------------------------------------------------");
      });
    }
    
  } catch (error) {
    console.error("\n\x1b[31m❌ Terjadi kesalahan:\x1b[0m");
    console.error(error.message || error);
  }
}

run();
