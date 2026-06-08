#!/bin/bash
echo "============================================="
echo "  Mulai Proses Update & Deploy Otomatis      "
echo "============================================="

# 1. Tarik update terbaru dari Git
echo -e "\n[1/5] Mengambil kode terbaru dari Github..."
git pull origin main

# 2. Install package baru jika ada
echo -e "\n[2/5] Menginstall dependensi baru..."
npm install

# 3. Sinkronisasi skema database
echo -e "\n[3/5] Menjalankan migrasi database (Prisma)..."
npm run migrate

# 4. Build ulang aplikasi Next.js
echo -e "\n[4/5] Membangun (building) Next.js produksi..."
npm run build

# 5. Restart aplikasi di PM2
echo -e "\n[5/5] Memulai ulang (restarting) proses PM2..."
pm2 restart inventory

echo -e "\n============================================="
echo "  ✓ Update & Deploy Sukses!                  "
echo "============================================="
