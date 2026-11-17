# Desain Fitur: Pecah Item Penerimaan Barang (Multi-Item Goods Receipt)

Tanggal: 2026-11-17
Branch: `pisah_relay_base_transaksi`

## 1. Latar Belakang & Tujuan

Pada pengadaan di Odoo, satu baris PO terkadang merepresentasikan dua atau lebih komponen fisik yang berbeda namun dibeli dalam satu baris pesanan, misalnya `Relay MY4N 220Vac` (10 Pcs @ Rp 67.488) yang secara fisik terdiri dari **Relay** dan **Base/Socket**.

- **Tujuan:** Memungkinkan staf gudang/MTC memecah 1 baris penerimaan PO menjadi beberapa `StockMovement` ke `Sparepart` master yang berbeda dalam **1 transaksi atomik**, langsung dari modal **Terima Barang** tanpa menambah banyak modal baru.
- **Non-tujuan:**
  - Tidak membuat master sparepart gabungan ("1 Set").
  - Tidak memecah baris `ProcurementTracking` menjadi banyak baris sebelum PO selesai (agar sinkronisasi 1-to-1 dengan PO Odoo tetap aman).
  - Tidak mendukung kedatangan parsial per komponen atau tujuan stok berbeda per komponen dalam 1 transaksi (sesuai kebutuhan pengguna: kedatangan dan tujuan akhir komponen pecahan selalu sama, yaitu sama-sama `Masuk Stok Gudang` atau sama-sama `Langsung Pakai`).
- **Anti-tujuan:** Penumpukan modal di atas modal (nested modal), form sempit yang menyulitkan input harga, atau dekorasi ikon/emoji berlebihan.

## 2. Alur & Struktur UI

### 2.1 Satu Modal Penerimaan dengan 3 Mode (`ReceiveModal.tsx`)

Modal `Pencatatan Penerimaan Barang` (`components/mtc/po-pr/Modals/ReceiveModal.tsx`) mempertahankan satu pintu masuk dari tombol **Terima Barang** dan menyediakan 3 pilihan mode di `Mode Satuan Pembelian`:

1. `Satuan Biasa (Unit/Pcs)` (default `maxWidth: 540px`)
2. `Kemasan (Pack/Box/Set)` (`maxWidth: 540px`)
3. `Pecah Item (Multi-Item)` (modal melebar ke `maxWidth: 820px` agar kolom pilih sparepart, qty, dan pembagian harga leluasa tanpa membuka modal kedua)

### 2.2 Tata Letak Mode Pecah Item

- **Header ringkas PO:** Menampilkan nama item Odoo, PR/PO, total qty dokumen, dan total nilai PO (`qty * harga`, mis. `10 x Rp 67.488 = Rp 674.880`).
- **Daftar Komponen Pecahan (minimal 2 baris, default 2 baris kosong saat baru dibuka):**
  Setiap baris komponen berisi:
  1. **Sparepart Master:** Input pencarian sparepart (`/api/mtc/master/sparepart?simple=true&search=...`) dengan status loading, empty, dan error yang jelas. Jika barang belum ada di Master (mis. Base Relay), tersedia panel inline `+ Buat Master Baru` langsung di baris tersebut (tanpa modal baru) yang memanggil `POST /api/mtc/master/sparepart` lalu otomatis memilih sparepart baru tersebut.
  2. **Qty Diterima:** Angka (`>= 1`), default mengikuti `receivingItem.qty` (mis. `10`).
  3. **Harga Satuan (Rp):** Input angka (`>= 0`).
  4. **Subtotal & Hapus Baris:** Menampilkan `qty * hargaSatuan` dan tombol hapus baris (nonaktif jika tersisa <= 2 baris).
- **Panel Kalkulator Alokasi Harga PO:**
  - Menampilkan **Total Nilai PO**, **Total Alokasi Pecahan** (`sum(qty * harga)`), dan **Selisih** (`Total Alokasi - Total Nilai PO`, berwarna hijau jika `Rp 0` atau kuning jika ada selisih sebagai pengingat yang tetap tidak memblokir jika memang ada penyesuaian harga).
  - Tombol bantu cepat:
    - `Bagi Rata`: membagi nilai PO rata ke semua komponen berdasarkan qty masing-masing.
    - `Isi Sisa ke Baris Terakhir`: menghitung sisa nilai PO yang belum teralokasi dan memasukkannya ke baris terakhir (dibagi qty baris terakhir).
- **Field Bersama 1 Transaksi:** Tanggal Penerimaan Fisik, Vendor Pembuat PO, dan Tujuan Akhir Penerimaan (`Masuk Stok Gudang` atau `Langsung Pakai`). Pada mode Pecah Item, tombol `Masuk Stok Gudang` **aktif** meskipun `receivingItem.sparepartId` di PO awalnya `null` (selama komponen pecahan memiliki `sparepartId`).

## 3. Arah Visual & Kepatuhan `antislop-ui`

- **Design Read:** `Modal transaksi penerimaan multi-item (Goods Receipt) untuk staf gudang dan teknisi maintenance MTC, menggunakan bahasa visual dark operational tool yang sudah ada (#13131a / #1a1a24, font Inter, satu aksen fungsional hijau untuk konfirmasi penerimaan dan ungu/biru untuk state aktif), dial ENERGY 1 / RHYTHM 1 / MOTION 1.`
- **Kebersihan Ikon & Copy (`R-02`, `R-04`):** Menghapus emoji dekoratif (`📥`, `🔩`, `📦`, `⚡`, `✖`, `⚠️`, `📐`) pada modal penerimaan. Menggunakan teks bersih dan maksimal ikon SVG fungsional berukuran 16px hanya pada kontrol yang membutuhkan (tombol tutup modal, hapus baris, dan tambah item) dengan `aria-hidden="true"` dan `aria-label` yang jelas. Tanpa karakter em dash (`—`).
- **Palet & Kontras (`R-25`, `R-29`):** Permukaan `#13131a` / `#1a1a24` / `#22222e`, teks utama `#eeeef4`, teks sekunder `#a0a0c0` (menggantikan `#606080` pada teks label/informasi agar lolos rasio kontras WCAG AA >= 4.5:1). Tombol aksi hijau menggunakan kombinasi warna teks/latar yang lolos >= 4.5:1 (mis. latar `#15803d` dengan teks `#ffffff` atau teks gelap `#052e16` di atas `#3eb574`).
- **Aksesibilitas & Responsivitas (`R-03`, `R-32`, `R-39`):**
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, tutup dengan tombol `Escape`.
  - Fokus terlihat (`:focus-visible`) pada seluruh input dan tombol; tidak ada `div` yang dapat diklik menggantikan `<button>`.
  - Layout grid baris pecahan otomatis bertumpuk (stack) pada layar sempit (< 640px) dengan scroll internal agar tidak overflow horizontal dan target sentuh tombol minimal 44px.

## 4. Perubahan Backend & Integrasi

1. **`POST /api/mtc/procurement/receive` (`app/api/mtc/procurement/receive/route.ts`):**
   - Memperbarui cabang `receivedParts` (Section A) agar menerima `receivedParts` minimal 1-2+ item valid (`sparepartId`, `qty >= 1`, `harga >= 0`).
   - Dalam 1 `prisma.$transaction`:
     - Menghapus mutasi lama `[Penerimaan Paket #${tracking.id}` yang tidak lagi ada di `receivedParts` (idempoten jika penerimaannya diedit/disimpan ulang), lalu `update`/`create` `StockMovement` bertipe `IN` (jika `isStocked`) atau `LOG` (jika langsung pakai) dengan keterangan `[Penerimaan Paket #${tracking.id} PR: ... / PO: ...] Bagian dari paket: ${tracking.originalName}`.
     - Memperbarui `harga`, `avgLeadTime`, `maxLeadTime`, dan mereset `purchasingStatus: 'NONE'` pada setiap `Sparepart` terkait.
     - Menyimpan metadata terstruktur ke `ProcurementTracking.linkedPartsJson`:
       `{ type: 'bundle', parts: [{ sparepartId, nama, qty, harga }] }`
       serta mengisi `tanggalTerima`, `isStocked`, `harga` (final PO price), dan `vendor`.
2. **`DELETE /api/mtc/procurement/receive`:**
   - Tetap menghapus semua `StockMovement` dengan prefix `[Penerimaan Paket #${tracking.id}`, dan turut memperbarui `purchasingStatus` seluruh `sparepartId` yang tercatat di `linkedPartsJson` (jika `type === 'bundle'` atau array lama).
3. **`PATCH /api/mtc/procurement` (`app/api/mtc/procurement/route.ts`):**
   - Mengubah pembaruan `StockMovement` saat toggle `isStocked` dari `findFirst` menjadi `updateMany` untuk prefix `[Penerimaan Paket #${updated.id}` agar seluruh komponen pecahan ikut berubah status (`IN` <-> `LOG`).
4. **Odoo Sync (`app/api/mtc/odoo/sync/route.ts`):**
   - Menjaga agar item yang memiliki `linkedPartsJson` bertipe `bundle` (atau array) dan sudah memiliki `tanggalTerima` tidak terkena auto-split parsial jika `qty` salah satu komponen berbeda dari `matchedQty` Odoo.
5. **Tampilan Tabel (`components/mtc/po-pr/ProcurementGroupList.tsx`):**
   - Pada kolom koneksi database master, jika `linkedPartsJson` bertipe `bundle` (atau array), tampilkan ringkasan komponen pecahan (nama sparepart, qty, dan harga/unit) sehingga tidak tampil sebagai `Unlinked / General`.

## 5. Verifikasi yang Direncanakan

- Typecheck / build aplikasi (`npm run build` / `npx tsc --noEmit`).
- Uji alur interaktif di modal: buka Terima Barang pada item unlinked, pindah ke mode Pecah Item, cari sparepart, buat master sparepart inline, gunakan tombol Bagi Rata / Isi Sisa, simpan penerimaan dalam 1 transaksi, cek 2 kartu stok bertambah, cek tampilan tabel PO/PR, uji Batal Terima, serta cek keyboard navigation (`Tab`, `Escape`) dan viewport mobile.
