/**
 * Lab Authenticode signing (self-signed PFX). For authorized testing only.
 * Does NOT impersonate Microsoft or other vendors. SmartScreen still blocks on
 * machines that do not trust your lab CA — install certs/lab-codesign.cer on test VMs.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CERTS_DIR = path.join(ROOT, 'certs');
const LAB_PFX = path.join(CERTS_DIR, 'lab-codesign.pfx');
const LAB_CER = path.join(CERTS_DIR, 'lab-codesign.cer');

const DEFAULT_SUBJECT =
  'CN=Software Update Publisher, O=Corporate IT Services, L=Redmond, S=WA, C=US';

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

/** Locate signtool.exe from Windows SDK if not on PATH */
function findSigntoolSync() {
  if (process.platform !== 'win32') return null;
  const kitsRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  if (!fs.existsSync(kitsRoot)) return null;
  let best = null;
  try {
    const versions = fs.readdirSync(kitsRoot).filter((v) => /^\d/.test(v)).sort().reverse();
    for (const ver of versions) {
      for (const sub of ['x64', 'x86', 'arm64']) {
        const candidate = path.join(kitsRoot, ver, sub, 'signtool.exe');
        if (fs.existsSync(candidate)) {
          best = candidate;
          break;
        }
      }
      if (best) break;
    }
  } catch (_) {}
  return best;
}

async function resolveSigntool() {
  const onPath = await which('signtool');
  if (onPath) return onPath;
  return findSigntoolSync();
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

function labSignPass() {
  return process.env.BUILD_SIGN_PASS || process.env.SIGN_PASS || process.env.LAB_SIGN_PASS || 'lab-sign-change-me';
}

function autoLabEnabled() {
  const v = (process.env.BUILD_SIGN_AUTO || process.env.LAB_SIGN_AUTO || 'true').toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

function resolveConfiguredPfx() {
  const pfx = (process.env.BUILD_SIGN_PFX || process.env.SIGN_PFX || '').trim();
  if (!pfx) return null;
  const pfxPath = path.isAbsolute(pfx) ? pfx : path.join(ROOT, pfx);
  return fs.existsSync(pfxPath) ? pfxPath : null;
}

async function ensureLabPfx(opts = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, reason: 'Lab cert generation requires Windows' };
  }
  const allowAuto = opts.autoLab !== false && autoLabEnabled();
  if (fs.existsSync(LAB_PFX)) {
    return { ok: true, pfxPath: LAB_PFX, lab: true, subject: readLabSubjectFromEnv(opts) };
  }
  if (!allowAuto) {
    return { ok: false, reason: 'Lab auto-sign disabled and no lab PFX' };
  }

  fs.mkdirSync(CERTS_DIR, { recursive: true });
  const subject = readLabSubjectFromEnv(opts);
  const pass = labSignPass();
  const ps1 = path.join(__dirname, 'generate-lab-codesign.ps1');
  if (!fs.existsSync(ps1)) {
    return { ok: false, reason: 'generate-lab-codesign.ps1 missing' };
  }

  try {
    await run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', ps1,
      '-Subject', subject,
      '-PfxPath', LAB_PFX,
      '-CerPath', LAB_CER,
      '-Password', pass,
    ]);
  } catch (e) {
    return { ok: false, reason: e.message || 'PowerShell cert generation failed' };
  }

  if (!fs.existsSync(LAB_PFX)) {
    return { ok: false, reason: 'PFX was not created' };
  }
  console.log(`[BUILDER] Lab code-signing PFX created: ${LAB_PFX}`);
  console.log(`[BUILDER] Trust on test VM: import ${LAB_CER} → Trusted Root + Trusted Publishers`);
  return { ok: true, pfxPath: LAB_PFX, lab: true, created: true, subject };
}

function readLabSubjectFromEnv(opts = {}) {
  const fromReq = opts.subject && String(opts.subject).trim();
  if (fromReq) return fromReq;
  return (process.env.BUILD_SIGN_SUBJECT || DEFAULT_SUBJECT).trim();
}

async function resolveSigningPfx(opts = {}) {
  const configured = resolveConfiguredPfx();
  if (configured) return { pfxPath: configured, lab: false };
  const lab = await ensureLabPfx(opts);
  if (lab.ok) return { pfxPath: lab.pfxPath, lab: true, created: lab.created, subject: lab.subject };
  return { pfxPath: null, reason: lab.reason };
}

async function signPeFile(filePath, opts = {}) {
  if (opts.enabled === false) {
    return { signed: false, skipped: true, reason: 'Signing disabled for this build' };
  }
  if (process.platform !== 'win32') {
    return { signed: false, reason: 'Signing runs on Windows build host only' };
  }
  if (!/\.(exe|dll)$/i.test(filePath)) {
    return { signed: false, reason: 'Not a PE file' };
  }

  const resolved = await resolveSigningPfx(opts);
  if (!resolved.pfxPath) {
    return { signed: false, reason: resolved.reason || 'No signing PFX' };
  }

  const signtool = await resolveSigntool();
  if (!signtool) {
    return { signed: false, reason: 'signtool not found (install Windows SDK Signing Tools)' };
  }

  const pass = labSignPass();
  const timestamp = (process.env.BUILD_SIGN_TIMESTAMP || 'http://timestamp.digicert.com').trim();
  const pfxPath = resolved.pfxPath;

  const attempt = async (useTimestamp) => {
    const args = ['sign', '/f', pfxPath];
    if (pass) args.push('/p', pass);
    args.push('/fd', 'sha256');
    if (useTimestamp && timestamp) {
      args.push('/tr', timestamp, '/td', 'sha256');
    }
    args.push('/v', filePath);
    await run(signtool, args);
  };

  try {
    try {
      await attempt(true);
    } catch (e) {
      console.warn('[BUILDER] Timestamp sign failed, retrying without timestamp:', e.message);
      await attempt(false);
    }
    console.log(`[BUILDER] Authenticode signed (${resolved.lab ? 'lab' : 'custom'}): ${path.basename(filePath)}`);
    return {
      signed: true,
      lab: resolved.lab,
      pfx: path.basename(pfxPath),
      publisher: resolved.subject || readLabSubjectFromEnv(opts),
    };
  } catch (e) {
    return { signed: false, reason: e.message || 'signtool failed' };
  }
}

function getSigningStatus() {
  const configured = resolveConfiguredPfx();
  const labExists = fs.existsSync(LAB_PFX);
  const pfxPath = configured || (labExists ? LAB_PFX : null);
  const signtool = findSigntoolSync();
  return {
    hostIsWindows: process.platform === 'win32',
    pfxConfigured: !!pfxPath,
    pfxFile: pfxPath ? path.basename(pfxPath) : null,
    labAuto: !configured && labExists,
    labCerAvailable: fs.existsSync(LAB_CER),
    labCerUrl: '/api/builder/signing/lab-cer',
    autoGenerate: autoLabEnabled(),
    signtoolFound: !!signtool,
    defaultSubject: DEFAULT_SUBJECT,
    canSignWindows: process.platform === 'win32' && !!signtool,
  };
}

module.exports = {
  signPeFile,
  getSigningStatus,
  ensureLabPfx,
  LAB_PFX,
  LAB_CER,
  DEFAULT_SUBJECT,
};
