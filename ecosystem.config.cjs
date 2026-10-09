/**
 * PM2 production — loads .env.production via server.js (APP_ENV=production).
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Local instead:
 *   npm run start:local
 */
module.exports = {
  apps: [
    {
      name: 'fahis-1',
      cwd: __dirname,
      script: 'server.js',
      args: '--env=production',
      exec_mode: 'fork',
      instances: 1,
      env: {
        APP_ENV: 'production',
        NODE_ENV: 'production',
      },
    },
  ],
};
