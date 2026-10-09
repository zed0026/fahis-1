const fs = require('fs');
const p = process.argv[2] || 'builds/mv0t8j6k_fcbb3a0a/main.go';
const s = fs.readFileSync(p, 'utf8');
const key = (s.match(/const xorKey = "([^"]+)"/) || [])[1];
const host = (s.match(/obfC2Host\s*=\s*"([0-9a-fA-F]+)"/) || [])[1];
const port = (s.match(/obfPortStr\s*=\s*"([0-9a-fA-F]+)"/) || [])[1];
function xor(d, k) {
  const K = Buffer.from(k);
  const o = Buffer.from(d);
  for (let i = 0; i < o.length; i++) o[i] ^= K[i % K.length];
  return o;
}
function deob(h, k) {
  return Buffer.from(xor(Buffer.from(h, 'hex'), k).toString(), 'base64').toString();
}
console.log({ key, host: deob(host, key), port: deob(port, key) });
