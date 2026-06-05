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
    // Ignore permission or missing directory errors
  }
  return size;
}

const rootDir = path.join(__dirname, '..');
const dirs = fs.readdirSync(rootDir);

let totalSize = 0;
const details = [];

for (const item of dirs) {
  const itemPath = path.join(rootDir, item);
  const stats = fs.statSync(itemPath);
  let size = 0;
  if (stats.isDirectory()) {
    size = getDirSize(itemPath);
  } else {
    size = stats.size;
  }
  totalSize += size;
  details.push({ name: item, size, isDir: stats.isDirectory() });
}

// Sort by size descending
details.sort((a, b) => b.size - a.size);

console.log("=== PROJECT SIZE DETAILS ===");
console.log(`Total Project Size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB (${totalSize.toLocaleString()} bytes)\n`);

console.log("Details by folder/file:");
console.log("-------------------------------------------");
for (const item of details) {
  const sizeMB = (item.size / (1024 * 1024)).toFixed(2);
  const typeStr = item.isDir ? "[DIR]" : "[FILE]";
  if (item.size > 1024 * 1024) {
    console.log(` - ${typeStr} ${item.name}: ${sizeMB} MB`);
  } else if (item.size > 1024) {
    console.log(` - ${typeStr} ${item.name}: ${(item.size / 1024).toFixed(2)} KB`);
  } else {
    console.log(` - ${typeStr} ${item.name}: ${item.size} bytes`);
  }
}
console.log("-------------------------------------------");
