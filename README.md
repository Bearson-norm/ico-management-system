# Inventory (MTC + GA)

Satu aplikasi **Next.js** dengan **dua database PostgreSQL** (`mtc_db`, `ga_db`), routing `/mtc/*` dan `/ga/*`, autentikasi terpisah per tenant.

## Persyaratan

- Node.js 20+
- PostgreSQL (lokal: biasanya port **5432**; di VPS bisa port lain, mis. **1357**)
- Variabel lingkungan: lihat [`.env.example`](.env.example)

## Pengembangan lokal (Postgres port **5432**)

1. **Pastikan Postgres jalan** di `127.0.0.1:5432` dan ada database `mtc_db` dan `ga_db` (user punya hak ke keduanya).

   **Opsi A — Docker di repo ini** (membuat `mtc_db` + `ga_db` lewat skrip init):

   ```bash
   docker compose up -d
   ```

   Default image: user `dev`, password `devpassword` (sama seperti `.env.example`).  
   Jika di mesin Anda port **5432** sudah dipakai Postgres lain, edit `docker-compose.yml` jadi mis. `"5433:5432"` lalu di `.env` ganti `5432` menjadi `5433`.

   **Opsi B — Postgres terpasang di Windows** (pgAdmin / layanan): buat dua database manual, lalu sesuaikan `DATABASE_URL_*` di `.env` (user `postgres` atau user Anda).

2. **Aplikasi**

   ```bash
   cp .env.example .env
   # Sesuaikan USER, PASSWORD, host, port di .env jika perlu
   npm ci
   npm run prisma:generate
   npm run migrate:dev:mtc
   npm run migrate:dev:ga
   npm run seed
   npm run dev
   ```

- Beranda: `/` — pilih MTC atau GA.
- **MTC:** `admin` / `admin123` (ganti segera).
- **GA:** `gaadmin` / `gaadmin123` (ganti segera).

## Build & produksi

```bash
npm run build
npm run start:prod
```

- **`start:prod`** — `next start` di **127.0.0.1:1325** (hanya dari mesin VPS; publik lewat nginx).
- PM2 memakai [`ecosystem.config.cjs`](ecosystem.config.cjs) → `npm run start:prod`.
- `NEXTAUTH_URL` harus URL publik **HTTPS** domain Anda (bukan `http://127.0.0.1:1325`).

## Nginx + HTTPS (`msic.moof-set.web.id`)

**Prasyarat:** DNS **A** (atau AAAA) untuk `msic.moof-set.web.id` mengarah ke IP VPS. PM2/Next sudah jalan di **127.0.0.1:1325** (setelah `pm2 reload ecosystem.config.cjs` dengan skrip terbaru).

### 1. Pasang Certbot (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Konfigurasi nginx — tahap HTTP dulu

```bash
sudo cp deploy/nginx/msic.moof-set.web.id.http.conf /etc/nginx/sites-available/msic.moof-set.web.id
sudo ln -sf /etc/nginx/sites-available/msic.moof-set.web.id /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

(Jika repo Anda di path lain, salin isi file tersebut manual ke `sites-available`.)

### 3. Ambil sertifikat TLS

```bash
sudo certbot --nginx -d msic.moof-set.web.id
```

Ikuti prompt. Certbot biasanya menambahkan blok **443** dan menyimpan sertifikat di `/etc/letsencrypt/live/msic.moof-set.web.id/`.

### 4. Konfigurasi penuh (redirect HTTP → HTTPS)

Sesuaikan dengan apa yang sudah dibuat Certbot, atau ganti site dengan contoh siap pakai:

```bash
sudo cp deploy/nginx/msic.moof-set.web.id.conf /etc/nginx/sites-available/msic.moof-set.web.id
sudo nginx -t && sudo systemctl reload nginx
```

Pastikan path `ssl_certificate` / `ssl_certificate_key` sama dengan hasil Certbot (biasanya sudah cocok untuk domain tersebut).

### 5. `.env` di VPS (NextAuth)

```env
NEXTAUTH_URL="https://msic.moof-set.web.id"
```

Lalu reload app: `pm2 reload ecosystem.config.cjs --update-env`.

## Migrasi

```bash
npm run migrate:mtc
npm run migrate:ga
```

## CI/CD (GitHub Actions)

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — lint, validasi Prisma, build (setiap PR / push ke `main` atau `master`).
- [`.github/workflows/deploy-vps.yml`](.github/workflows/deploy-vps.yml) — deploy ke VPS lewat SSH saat push ke **`main`** atau **`master`**, atau manual lewat **Actions → Deploy VPS → Run workflow**.

### Setup satu kali di VPS

1. **PostgreSQL** — buat database `mtc_db` dan `ga_db`, user dengan hak akses penuh ke keduanya (port bisa 5432 atau lain, mis. 1357).
2. **Node.js 20+**, **git**, **PM2** (`npm i -g pm2`), **nginx** (opsional tapi disarankan untuk HTTPS).
3. **Clone repo GitHub** ke folder tersebut (bukan copy manual tanpa `.git` — deploy menyamakan kode dengan `git fetch` + `git reset --hard`):

   ```bash
   cd /var/www
   sudo rm -rf inventory   # hati-hati: hanya jika folder boleh dihapus
   sudo git clone https://github.com/USERNAME/REPO.git inventory
   sudo chown -R "$USER":"$USER" inventory
   cd inventory
   ```

   Atau clone dengan SSH: `git clone git@github.com:USERNAME/REPO.git inventory`.  
   Pastikan setelah clone ada folder **`.git`** di dalam `inventory/`.

4. **File `.env` di server** (wajib ada sebelum deploy CI jalan):

   ```bash
   cp .env.example .env
   nano .env
   ```

   Isi minimal:

   - `DATABASE_URL_MTC` / `DATABASE_URL_GA` — host `127.0.0.1` (atau socket/host DB Anda), user, password, nama DB, **port benar**.
   - `NEXTAUTH_SECRET` — string acak panjang (produksi).
   - `NEXTAUTH_URL` — URL publik aplikasi, mis. `https://inventory.domainanda.com` (bukan `http://127.0.0.1:1325`).
   - Untuk bind di belakang nginx: `HOST=127.0.0.1` dan `PORT=1325` (sesuai [`deploy/nginx/inventory.conf`](deploy/nginx/inventory.conf)).

5. **Deploy pertama manual** (setelah DB siap):

   ```bash
   npm ci
   npm run prisma:generate
   npm run migrate
   npm run build
   pm2 start ecosystem.config.cjs
   pm2 save
   # sekali saja agar PM2 hidup lagi setelah reboot:
   # pm2 startup
   ```

6. **Nginx** — salin / sesuaikan [`deploy/nginx/inventory.conf`](deploy/nginx/inventory.conf) (ganti `server_name`, pasang TLS mis. dengan Certbot), lalu `sudo nginx -t && sudo systemctl reload nginx`.

7. **SSH untuk GitHub Actions** — di VPS, buat user deploy (atau pakai user Anda), pasang **public key** yang dipasangkan dengan private key yang akan disimpan di GitHub:

   ```bash
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   # tambahkan baris authorized_keys untuk key khusus CI
   ```

   Di repo GitHub: **Settings → Secrets and variables → Actions**, tambahkan:

   | Secret | Isi |
   |--------|-----|
   | `VPS_HOST` | IP atau hostname VPS |
   | `VPS_USER` | User SSH (mis. `deploy`) |
   | `VPS_SSH_KEY` | **Private key** PEM (full text, termasuk `BEGIN` / `END`) |
   | `VPS_APP_PATH` | Path absolut ke app, mis. `/var/www/inventory` |

   SSH port bukan 22? Edit workflow dan tambahkan `port: 22` di step `appleboy/ssh-action` sesuai port Anda.

8. **Jika sebelumnya PM2 pakai perintah lama** (`pm2 start npm --name inventory …`), hapus sekali agar tidak bentrok:

   ```bash
   pm2 delete inventory 2>/dev/null || true
   pm2 start ecosystem.config.cjs && pm2 save
   ```

Setelah itu setiap **push ke `main`/`master`** yang lolos akan menjalankan: `git fetch` + `git reset --hard` (kode sama persis dengan GitHub; **perubahan lokal pada file ter-track** di VPS dibuang) → `npm ci` → `prisma generate` → `migrate` → `build` → `pm2 reload` / start lewat [`ecosystem.config.cjs`](ecosystem.config.cjs). File **`.env`** tidak di-commit sehingga **tetap utuh**.

### Catatan

- Workflow memuat `nvm` (`~/.nvm/nvm.sh`) jika ada, agar `node` / `npm` terbaca di sesi non-interaktif.
- Pastikan remote `origin` mengarah ke repo yang sama dengan GitHub Actions (biasanya HTTPS atau SSH dengan deploy key untuk `git fetch`).

### Login: 401 di `/api/auth/callback/credentials`

- **401 + error `CredentialsSignin` di UI** → user/sandi salah, atau user belum ada di DB (jalankan `npm run seed` di VPS).
- **401 / error lain (mis. `Configuration`)** → di **`.env` produksi** pastikan **`NEXTAUTH_URL`** persis URL yang dibuka browser, mis. `https://msic.moof-set.web.id` (HTTPS jika pakai TLS, **tanpa** slash akhir berlebihan). Setelah ubah `.env`, `pm2 reload ecosystem.config.cjs --update-env`.
- **Nginx** harus mengirim **`X-Forwarded-Proto`** dan **`X-Forwarded-Host`** ke upstream (lihat contoh di [`deploy/nginx/msic.moof-set.web.id.conf`](deploy/nginx/msic.moof-set.web.id.conf)).
- **Jangan** set `NEXTAUTH_URL` ke `https://localhost:1325` — itu memicu redirect ke host salah. Pakai URL publik penuh, mis. `https://msic.moof-set.web.id`.

### Deploy gagal: ".env tidak ada"

- Isi secret **`VPS_APP_PATH`** dengan path **absolut** ke root repo (tempat `package.json` dan **`.env`**). Contoh: `/var/www/inventory` — **bukan** `~/inventory` atau hanya `inventory`.
- Di VPS, pastikan file ada untuk user yang sama dengan **`VPS_USER`**: `ls -la /var/www/inventory/.env` (ganti path). Buat jika perlu: `cd /var/www/inventory && cp .env.example .env && nano .env`.
- Jika secret **`VPS_APP_PATH` kosong** di GitHub, workflow akan masuk ke home directory dan gagal menemukan `.env`.
- Log deploy berikutnya menampilkan baris `>>> Deploy cwd:` — pastikan path itu sama dengan lokasi `.env` Anda.

### Deploy gagal: "not a git repository"

Folder di VPS harus **clone GitHub** (ada subfolder **`.git`**), karena deploy menjalankan `git fetch` + `git reset --hard`. Jika Anda hanya meng-upload file ZIP / copy tanpa `.git`, backup `.env`, lalu clone ulang seperti di langkah **3** bagian setup VPS, lalu kembalikan `.env`.

### Deploy / migrate: `P1000` Authentication failed

PostgreSQL menolak **user atau password** di `DATABASE_URL_MTC` / `DATABASE_URL_GA` di file **`.env` di VPS**. Jika log menyebut user `admin`, artinya di `.env` tertulis `postgresql://admin:...@127.0.0.1:5433/...` — role **`admin` harus benar-benar ada di Postgres** dengan sandi yang sama, atau ganti URL ke user yang sudah valid (mis. `postgres`).

1. **Tes koneksi** di VPS (ganti port `5433` / user / sandi / nama DB sesuai Anda):

   ```bash
   psql "postgresql://USER:PASS@127.0.0.1:5433/mtc_db" -c "select 1"
   ```

   Baru berhasil → salin string URL persis ke `.env`.

2. **Ingin memakai user `admin` khusus aplikasi?** Masuk `psql` sebagai superuser (mis. `sudo -u postgres psql -p 5433 -d postgres`), lalu (ganti sandi):

   ```sql
   CREATE ROLE admin WITH LOGIN PASSWORD 'ganti-sandi-kuat';
   CREATE DATABASE mtc_db OWNER admin;
   CREATE DATABASE ga_db OWNER admin;
   ```

   Jika database **sudah ada** dan owner masih `postgres`:

   ```sql
   CREATE ROLE admin WITH LOGIN PASSWORD 'ganti-sandi-kuat';
   ALTER DATABASE mtc_db OWNER TO admin;
   ALTER DATABASE ga_db OWNER TO admin;
   ```

   Lalu di **`.env`** pakai `postgresql://admin:ganti-sandi-kuat@127.0.0.1:5433/mtc_db` (sandi harus sama; karakter khusus di sandi harus di-**URL-encode** di dalam URL).

3. **Lebih simpel:** pakai user `postgres` + sandi yang Anda tahu di `.env`, tanpa membuat `admin`.

**Port / host salah di log Prisma?** Prisma membaca **`.env`** di root project, **bukan** `.env.example`. Mengedit hanya `.env.example` tidak mengubah migrate. Di log deploy ada baris `DATABASE_URL_* dari file .env` (password disamarkan) untuk memverifikasi host:port.

### Deploy / migrate: `permission denied for schema public`

Umum di **PostgreSQL 15+**: schema `public` tidak lagi memberi hak **CREATE** ke semua user; Prisma migrate perlu membuat tabel `_prisma_migrations` di `public`.

Masuk sebagai superuser (mis. `sudo -u postgres psql -p 5433 -d postgres`), ganti **`APPUSER`** dengan user di `DATABASE_URL` Anda (mis. `admin`):

```sql
\c mtc_db
GRANT USAGE, CREATE ON SCHEMA public TO APPUSER;
\c ga_db
GRANT USAGE, CREATE ON SCHEMA public TO APPUSER;
```

**Alternatif:** jadikan user aplikasi pemilik schema `public`:

```sql
\c mtc_db
ALTER SCHEMA public OWNER TO APPUSER;
\c ga_db
ALTER SCHEMA public OWNER TO APPUSER;
```

Lalu jalankan lagi migrate / deploy.

### Deploy gagal: "detected dubious ownership in repository"

Terjadi jika folder repo **dimiliki user lain** (misalnya `git clone` pakai `sudo`, owner `root`) sedangkan SSH deploy masuk sebagai user biasa (`foom`). Workflow menambahkan path ke `git config --global safe.directory` otomatis. Alternatif di VPS: `sudo chown -R foom:foom /path/ke/repo` (ganti user/path).

## Skema Prisma

- `prisma/mtc/schema.prisma` → client di `lib/generated/mtc`
- `prisma/ga/schema.prisma` → client di `lib/generated/ga`
