# 📖 PANDUAN MUDAH: ALUR KERJA SISTEM & CARA REQUES FITUR BARU 🛒✨
*(Dibuat khusus agar mudah dipahami, tanpa bahasa pemrograman atau istilah IT yang rumit!)*

Halo! Dokumen ini dibuat khusus untuk Anda agar bisa memahami bagaimana sistem pengisian barang belanjaan MTC Anda bekerja di balik layar, serta bagaimana cara mudah meminta perubahan fitur kepada AI jika di kemudian hari Anda ingin mengubah sesuatu.

---

## 🔄 BAGIAN 1: Bagaimana Cara Kerja Sistem Anda Saat Ini? (Pakai Analogi Sederhana)

Bayangkan sistem pengadaan barang MTC Anda seperti **berbelanja di Supermarket Pintar**. Berikut adalah langkah-langkah yang terjadi dari awal sampai barang tercatat di Google Sheets SCM:

### 🛒 Analogi Belanja Supermarket:

```
[ Form Input ] ──( 1. Ketik Nama )──> [ Buku Riwayat Pintar ] 
                                             │ (Mengisi otomatis: Harga, Vendor, Link)
                                             ▼
[ Keranjang Belanja ] <──( 2. Masukkan )─────┘
     │ (Data aman di browser, tidak hilang jika mati lampu/refresh)
     ▼
[ Nomor PR Bersama ]
     │ (Kelompokkan semua barang dalam satu nota PR)
     ▼
[ Tombol Kirim ] ───( 3. Proses Kirim )───> [ 💾 Buku Kas Lokal ] (Database)
                                                 │
                                                 └───( 4. Salin Otomatis )───> [ 📊 Google Sheets SCM ]
                                                                                   │
                                                                                   ├── Urgency: Normal -> Kosong ""
                                                                                   └── Urgency: Urgent -> Tulisan "Urgent"
```

---

### 📝 Penjelasan Detail Langkah-Langkah (Tanpa Istilah Teknis):

#### **Langkah 1: Mengetik Barang & "Buku Riwayat Pintar" (Autocomplete)**
* **Apa yang Anda lihat di layar:** Anda mulai mengetik nama barang (misal: *"Relay"*), lalu muncul pilihan barang-barang yang pernah Anda beli sebelumnya di bawah kolom ketikan. Ketika Anda klik salah satu pilihan, kolom Kategori, Harga Satuan, Rekomendasi Toko/Vendor, dan Link Toko **otomatis langsung terisi sendiri** tanpa perlu Anda salin satu per satu (Zero Copy-Paste).
* **Di balik layar:** Sistem membuka **"Buku Riwayat Pembelian"** di masa lalu, mengambil catatan harga dan toko terakhir untuk barang tersebut, lalu menuliskannya ke form Anda secara instan.

#### **Langkah 2: Memasukkan ke "Keranjang Belanja Sementara" (Draft Cart)**
* **Apa yang Anda lihat di layar:** Anda memasukkan jumlah barang (Qty), lalu klik tombol **`🛒 Tambahkan ke Keranjang`**. Form akan kembali bersih kosong agar Anda bisa menginput barang berikutnya, dan daftar barang yang sudah Anda masukkan akan muncul di dalam tabel **"Keranjang Rencana PR"** di bagian bawah.
* **Di balik layar:** Sistem menyimpan barang-barang tersebut ke dalam **"Kantong Memori Browser"** Anda. Karena disimpan di memori browser, daftar belanjaan di keranjang Anda **tidak akan hilang** meskipun komputer mati lampu, halaman tidak sengaja di-refresh, atau Anda menutup browser.

#### **Langkah 3: Mengelompokkan Barang di Satu Nota & Mengirim Masal (Batch Submit)**
* **Apa yang Anda lihat di layar:** Setelah semua barang terkumpul di keranjang, Anda menuliskan **Nomor PR Bersama** (misalnya: `PR/2026/05/100`) di kolom yang disediakan, lalu klik tombol biru besar **`🚢 Kirim Pengajuan PR Masal`**.
* **Di balik layar:** Sistem akan mengambil seluruh barang di keranjang, memberikan cap Nomor PR yang sama ke semua barang tersebut, lalu memproses pengirimannya sekaligus.

#### **Langkah 4: Penyimpanan Buku Kas & Menyalin ke Google Sheets SCM**
* **Di balik layar:** Sistem melakukan dua hal sekaligus dalam hitungan detik:
  1. **Menyimpan di Buku Kas Utama (Database Lokal):** Semua barang disimpan dengan aman di server lokal komputer Anda.
  2. **Menyalin ke Spreadsheet SCM (Google Sheets):** Sistem mengirimkan data tersebut ke Google Sheets tim procurement.
* **Aturan Khusus yang Diterapkan (Sesuai Permintaan Anda):**
  * **Kolom Status Gudang (Kolom F):** Mengirimkan tanda `TRUE` (Ya, masuk stok) atau `FALSE` (Tidak, langsung dipakai) dengan benar.
  * **Kolom Urgensi (Kolom K):** Jika barang bersifat biasa, sistem sengaja mengirimkan data kosong (`""`) agar kolom K di Google Sheets Anda **tetap kosong bersih**. Tulisan **"Urgent"** hanya akan muncul jika Anda benar-benar memilih opsi Urgent pada form!

---

## 📝 BAGIAN 2: Cara Mudah Mengajukan Perubahan Fitur (Untuk Anda yang Tidak Bisa Coding)

Jika suatu saat Anda ingin mengubah alur kerja (workflow) atau tampilan aplikasi, Anda **tidak perlu mengerti kode**. Anda hanya perlu menceritakan keinginan Anda dengan bahasa sehari-hari. 

### 💡 Contoh Cara Request yang Sangat Mudah:
> *"Halo AI, tolong dong ubah alur kerjanya. Saya ingin setiap kali tombol 'Kirim Masal' diklik, sistem memunculkan pesan peringatan konfirmasi dulu: 'Apakah Anda yakin ingin mengirim 5 item ini ke SCM?'. Kalau diklik YA baru deh terkirim, kalau TIDAK dibatalkan."*

---

### 📋 Kerangka/Template Panduan Request (Cukup Salin & Isi Saja):

Salin bagian di bawah ini, isi dengan bahasa santai Anda, lalu kirim ke AI di kolom chat:

```markdown
### 📢 SAYA INGIN MINTA PERUBAHAN FITUR BARU

**1. Apa masalah / tujuan yang ingin dicapai?**
* [Contoh: "Saya sering salah klik kirim keranjang, jadi saya butuh tombol batal/hapus untuk seluruh keranjang sekaligus" ATAU "Saya ingin menambah kolom baru untuk menuliskan Nama Teknisi yang meminta barang"]

**2. Bagaimana jalannya fitur ini di layar nanti? (Tulis langkah sederhananya):**
* [Langkah 1]: [Contoh: Saya membuka halaman keranjang belanja]
* [Langkah 2]: [Contoh: Saya melihat ada tombol merah baru bertuliskan 'Kosongkan Keranjang']
* [Langkah 3]: [Contoh: Ketika saya klik tombol itu, muncul konfirmasi. Jika saya klik Oke, seluruh item di keranjang langsung terhapus bersih]

**3. Apakah ada data baru yang harus dikirim ke Google Sheets?**
* [Contoh: "Ya, tolong tambahkan kolom Nama Teknisi tadi ke kolom baru di paling kanan Google Sheets" ATAU "Tidak ada, cukup disimpan di aplikasi ini saja"]
```

---

*Dokumen ini disimpan di folder proyek Anda agar tidak hilang: [MTC PRO/workflow_and_template.md](file:///c:/Users/Fooml/Downloads/ico-management-system-main/MTC%20PRO/workflow_and_template.md)*
