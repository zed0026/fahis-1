const fs = require('fs');
const path = require('path');

function xorEncode(data, key) {
  const k = Buffer.from(key);
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i++) out[i] ^= k[i % k.length];
  return out;
}
function deob(hex, key) {
  const x = Buffer.from(hex, 'hex');
  return Buffer.from(xorEncode(x, key).toString(), 'base64').toString();
}

const builds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'builds', 'index.json')));
for (const b of builds.slice(0, 5)) {
  const srcPath = path.join(__dirname, '..', 'builds', b.id, 'main.go');
  if (!fs.existsSync(srcPath)) {
    console.log(b.id, 'no main.go');
    continue;
  }
  const src = fs.readFileSync(srcPath, 'utf8');
  const key = (src.match(/const xorKey = "([^"]+)"/) || [])[1];
  const hex = (src.match(/obfInjectdll\s*=\s*"([0-9a-fA-F]+)"/) || [])[1];
  console.log(b.fileName, 'decoded=', JSON.stringify(key && hex ? deob(hex, key) : 'MISSING'));
}
