# Catatan Perbaikan Sinkronisasi Odoo & Penerimaan Barang MTC
**Tanggal:** 9 September 2026  
**Status:** ✅ Selesai, Teruji, dan Live di VPS

---

## 1. Masalah yang Terjadi Kemarin / Sebelumnya

1. **Barang yang sudah diterima kembali ke status "3. PO Terbit" saat sinkronisasi Odoo:**
   - **Contoh Kasus:** PR04699 (PO P14641) - Solenoid Valve & Push Button sudah diterima tanggal 1 September 2026 dan masuk History (`StockMovement`).
   - **Gejala:** Setiap cron sync Odoo berjalan, tanggal terima hilang (`tanggalTerima = null`), badge kembali menjadi `3. PO Terbit`, dan tombol hijau `📥 Terima Barang` muncul lagi.
   - **Penyebab Teknis:** Di file `app/api/mtc/odoo/sync/route.ts`, jika dokumen Good Received (GR) di Odoo masih berstatus draft / belum divalidasi oleh tim purchasing Odoo (`isGrDone === false` atau `qty_received === 0`), kode sebelumnya mengeksekusi:
     ```typescript
     updateData.tanggalTerima = null; // Menghapus tanggal terima fisik
     updateData.statusPo = 'PO';
     ```

2. **Split Penerimaan Parsial Menggandakan Kuantitas Item:**
   - **Contoh Kasus:** PR04674 (PO P14635) - Sprocket 12T & 15T ordered 3 pcs, baru datang 1 pcs.
   - **Gejala:** Di web di-split menjadi 1 pcs diterima dan 2 pcs sisa. Namun saat sinkronisasi Odoo berjalan, kedua baris tersebut ditimpa paksa dengan kuantitas penuh PO Odoo (3 pcs masing-masing). Akibatnya, total pesanan melonjak dari 6 pcs menjadi 12 pcs.
   - **Penyebab Teknis:** Di file `sync/route.ts`, setiap baris item pengadaan selalu ditimpa tanpa syarat dengan `updateData.qty = Math.round(matchedQty);` dari PO Odoo (3 pcs), tanpa mengecek apakah baris tersebut merupakan pecahan (split) penerimaan parsial.

3. **Status Master Suku Cadang (`Sparepart`) Tertimpa Menjadi 'PO':**
   - Sparepart yang sudah selesai diterima penuh (atau tersisa sebagian) ditimpa kembali menjadi `purchasingStatus = 'PO'` dan `purchasingQty = matchedQty` karena GR Odoo belum selesai divalidasi.

---

## 2. Perubahan Logika yang Diterapkan (`app/api/mtc/odoo/sync/route.ts`)

1. **Deteksi Penerimaan Fisik Berbasis Riwayat Nyata (`StockMovement`):**
   - Sebelum update, sistem mengecek apakah item sudah memiliki `tanggalTerima` atau tercatat di tabel `StockMovement` (baik format baru `[Penerimaan Pengadaan #${item.id}` maupun format historis).
   - Jika bukti penerimaan fisik ditemukan, **`tanggalTerima` TIDAK PERNAH DIHAPUS (tetap dipertahankan)** meskipun dokumen GR di Odoo masih berstatus draft.
   - Di web, status item tetap bertengger sebagai **`📦 Diterima (Belum GR)`** dan tombol penerimaan tidak akan muncul lagi.

2. **Perlindungan Kuantitas Baris Split (`siblingItems`):**
   - Sistem mendeteksi seluruh baris saudara (*sibling*) yang berasal dari PR, PO, dan nama barang yang sama.
   - Jika item dipecah (`siblingItems.length > 1`):
     - **Bagian yang sudah diterima:** kuantitas dikunci sesuai kuantitas penerimaan fisiknya (misal: 1 pcs).
     - **Bagian sisa pending:** kuantitas dihitung secara dinamis dari sisa pesanan PO Odoo:  
       `qty = Math.max(0, matchedQty - alreadyReceivedQty)` (misal: 3 - 1 = 2 pcs).
   - Total kuantitas gabungan tidak akan berlipat ganda lagi (tetap 3 pcs per jenis barang).

3. **Sinkronisasi Status Master Sparepart yang Bersih:**
   - Menghitung sisa pengadaan yang benar-benar masih *pending* (belum diterima fisik dan belum DONE).
   - Jika semua barang pengadaan sudah diterima fisik di gudang:
     - `purchasingStatus = 'NONE'`
     - `purchasingQty = 0`
     - `purchasingNoPo = null`
   - Jika masih ada sisa pengadaan (parsial):
     - `purchasingQty` mencatat sisa kuantitas pesanan yang sebenarnya masih ditunggu (misal: 2 pcs).

---

## 3. Hasil Verifikasi Live VPS Pasca-Deployment

Perbaikan telah diunggah ke VPS `/var/www/ico-management-system/`, Next.js telah di-build ulang (`npm run build`), PM2 direload (`pm2 reload inventory`), dan sinkronisasi Odoo otomatis telah dijalankan dan diverifikasi:

### Data PR04674 (Sprocket 12T & 15T):
- **Item #140 (Sprocket 12T):** Qty: **1 pcs** | Tanggal Terima: **08/09/2026** *(Status: 📦 Diterima (Belum GR))*
- **Item #1999 (Sprocket 12T):** Qty: **2 pcs** | Tanggal Terima: *null* *(Status: 3. PO Terbit - tombol terima sisa 2 pcs)*
- **Item #141 (Sprocket 15T):** Qty: **1 pcs** | Tanggal Terima: **08/09/2026** *(Status: 📦 Diterima (Belum GR))*
- **Item #2000 (Sprocket 15T):** Qty: **2 pcs** | Tanggal Terima: *null* *(Status: 3. PO Terbit - tombol terima sisa 2 pcs)*
- **Total:** Tepat 6 pcs (3 pcs + 3 pcs).

### Data PR04699 (Solenoid Valve & Push Button):
- **Item #148 (Solenoid Valve):** Tanggal Terima: **01/09/2026** (Tersimpan aman).
- **Item #150 (Push Button Hijau):** Tanggal Terima: **01/09/2026** (Tersimpan aman).
- **Item #151 (Push Button Merah):** Tanggal Terima: **01/09/2026** (Tersimpan aman).
- Tombol `📥 Terima Barang` tidak muncul lagi untuk item yang sudah diterima.

### Master Sparepart:
- **`MTC-SP-376` & `MTC-SP-377` (Sprocket 12T & 15T):** `purchasingStatus = 'PO'`, `purchasingQty = 2 pcs` (hanya sisa pesanan).
- **`MTC-SP-373`, `374`, `375` (Push Button & Solenoid):** `purchasingStatus = 'NONE'`, `purchasingQty = 0` (bersih).

---
*File ini disimpan agar mudah ditinjau kapan saja.*
