import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
    // pdfkit dimuat dari node_modules saat runtime agar file font .afm bawaannya
    // tidak hilang saat di-bundle webpack (ENOENT Helvetica.afm di VPS).
    serverComponentsExternalPackages: ['pdfkit'],
  },
  // Tanpa "standalone": PM2 memakai `next start` (bind HOST/PORT lewat ecosystem / .env).
  typescript: {
    // CI handles typescript checking, so we disable it during next build on VPS to save memory/CPU
    ignoreBuildErrors: true,
  },
  eslint: {
    // CI handles linting, so we disable it during next build on VPS to save memory/CPU
    ignoreDuringBuilds: true,
  },
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
