import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: false },
  // Tanpa "standalone": PM2 memakai `next start` (bind HOST/PORT lewat ecosystem / .env).
  webpack: (config) => {
    // Pastikan @/* resolve di semua OS (Linux/VPS); mengandalkan paths tsconfig saja kadang gagal saat build.
    const a = config.resolve.alias;
    config.resolve.alias = {
      ...(typeof a === 'object' && a !== null && !Array.isArray(a) ? a : {}),
      '@': __dirname,
    };
    return config;
  },
};

export default nextConfig;
