/**
 * PM2 — produksi di VPS (bind localhost:1325; nginx reverse proxy).
 * Jalankan dari root repo: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'inventory',
      cwd: __dirname,
      script: 'npm',
      args: 'run start:prod',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        // Cadangan jika Next membaca dari env (selaras dengan .env HOST/PORT)
        HOST: '127.0.0.1',
        PORT: '1325',
      },
    },
  ],
};
