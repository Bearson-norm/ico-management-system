const fs = require('fs');
const path = require('path');

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return size;
}

const rootDir = path.join(__dirname, '..');

// Path spesifik GA
const gaPaths = [
  path.join(rootDir, 'app', 'ga'),
  path.join(rootDir, 'app', 'api', 'ga'),
  path.join(rootDir, 'prisma', 'ga')
];

// Path spesifik MTC
const mtcPaths = [
  path.join(rootDir, 'app', 'mtc'),
  path.join(rootDir, 'app', 'api', 'mtc'),
  path.join(rootDir, 'prisma', 'mtc'),
  path.join(rootDir, 'MTC PRO')
];

// Hitung total size
let totalSize = getDirSize(rootDir);

// Hitung ukuran GA
let gaSize = 0;
for (const p of gaPaths) {
  if (fs.existsSync(p)) {
    const stats = fs.statSync(p);
    gaSize += stats.isDirectory() ? getDirSize(p) : stats.size;
  }
}

// Hitung ukuran MTC
let mtcSize = 0;
for (const p of mtcPaths) {
  if (fs.existsSync(p)) {
    const stats = fs.statSync(p);
    mtcSize += stats.isDirectory() ? getDirSize(p) : stats.size;
  }
}

// Hitung ukuran Shared / node_modules / .next
const nodeModulesSize = fs.existsSync(path.join(rootDir, 'node_modules')) ? getDirSize(path.join(rootDir, 'node_modules')) : 0;
const nextSize = fs.existsSync(path.join(rootDir, '.next')) ? getDirSize(path.join(rootDir, '.next')) : 0;
const gitSize = fs.existsSync(path.join(rootDir, '.git')) ? getDirSize(path.join(rootDir, '.git')) : 0;
const libSize = fs.existsSync(path.join(rootDir, 'lib')) ? getDirSize(path.join(rootDir, 'lib')) : 0;

const sharedSize = totalSize - gaSize - mtcSize;

console.log("=== DETAIL UKURAN MONOREPO (MTC VS GA) ===");
console.log(`Total Seluruh Project: ${(totalSize / (1024 * 1024)).toFixed(2)} MB\n`);

console.log("1. BAGIAN KHAS GA (General Affairs):");
console.log(`   - app/ga: ${(getDirSize(path.join(rootDir, 'app', 'ga')) / 1024).toFixed(2)} KB`);
console.log(`   - app/api/ga: ${(getDirSize(path.join(rootDir, 'app', 'api', 'ga')) / 1024).toFixed(2)} KB`);
console.log(`   - prisma/ga: ${(getDirSize(path.join(rootDir, 'prisma', 'ga')) / 1024).toFixed(2)} KB`);
console.log(`   * TOTAL GA SPECIFIC: ${(gaSize / (1024 * 1024)).toFixed(2)} MB (${gaSize.toLocaleString()} bytes)\n`);

console.log("2. BAGIAN KHAS MTC (Maintenance):");
console.log(`   - app/mtc: ${(getDirSize(path.join(rootDir, 'app', 'mtc')) / 1024).toFixed(2)} KB`);
console.log(`   - app/api/mtc: ${(getDirSize(path.join(rootDir, 'app', 'api', 'mtc')) / 1024).toFixed(2)} KB`);
console.log(`   - prisma/mtc: ${(getDirSize(path.join(rootDir, 'prisma', 'mtc')) / 1024).toFixed(2)} KB`);
console.log(`   - MTC PRO (Data CSV/Backup): ${(getDirSize(path.join(rootDir, 'MTC PRO')) / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   * TOTAL MTC SPECIFIC: ${(mtcSize / (1024 * 1024)).toFixed(2)} MB (${mtcSize.toLocaleString()} bytes)\n`);

console.log("3. BAGIAN BERSAMA (Shared / Build Cache / Library):");
console.log(`   - node_modules (Library NodeJS): ${(nodeModulesSize / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   - .next (Cache Build Web): ${(nextSize / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   - lib (Helper & DB Client): ${(libSize / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   - .git (Version Control Git): ${(gitSize / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   - Lainnya (Config files dll): ${((sharedSize - nodeModulesSize - nextSize - gitSize - libSize) / 1024).toFixed(2)} KB`);
console.log(`   * TOTAL SHARED SYSTEM: ${(sharedSize / (1024 * 1024)).toFixed(2)} MB (${sharedSize.toLocaleString()} bytes)`);
console.log("==========================================");
