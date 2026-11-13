/**
 * Standalone directory-style portal for builds/working (not the React C2 UI).
 */
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_BASE = '/artifacts2620';
const COOKIE_PENDING = 'artifacts_pending';
const COOKIE_AUTH = 'artifacts_auth';

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function cookieSecureSuffix(req) {
  if (process.env.ARTIFACTS_COOKIE_SECURE === '1') return '; Secure';
  const xf = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (xf === 'https') return '; Secure';
  return '';
}

function cookieLine(req, name, value, maxAgeSec) {
  const val = value == null ? '' : encodeURIComponent(String(value));
  const max = maxAgeSec == null ? '' : `; Max-Age=${maxAgeSec}`;
  return `${name}=${val}; Path=/; HttpOnly; SameSite=Lax${max}${cookieSecureSuffix(req)}`;
}

function applyCookies(req, res, specs) {
  const lines = specs.map((s) => {
    if (s.clear) return `${s.name}=; Path=/; HttpOnly; Max-Age=0`;
    return cookieLine(req, s.name, s.value, s.maxAge);
  });
  res.setHeader('Set-Cookie', lines);
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function artifactsConfig() {
  return {
    user: String(process.env.ARTIFACTS_USER || 'milauth').trim(),
    password: String(process.env.ARTIFACTS_PASSWORD || 'Artifacts2620').trim(),
    favoriteAnswer: String(process.env.ARTIFACTS_FAVORITE_ANSWER || '202121').trim(),
    question: String(process.env.ARTIFACTS_QUESTION || 'Who is your favorite?').trim(),
  };
}

function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>
    body { background: #000; color: #ccc; font-family: Georgia, "Times New Roman", serif; margin: 24px; }
    h1 { font-size: 1.35rem; font-weight: bold; color: #fff; }
    a { color: #6b9fff; }
    a:visited { color: #b88cff; }
    ul { line-height: 1.55; }
    form { margin-top: 18px; max-width: 360px; }
    label { display: block; margin: 10px 0 4px; font-size: 14px; }
    input[type=text], input[type=password] {
      width: 100%; padding: 8px; background: #111; border: 1px solid #444; color: #eee;
      font-family: monospace; font-size: 14px;
    }
    button {
      margin-top: 14px; padding: 8px 16px; background: #222; color: #eee;
      border: 1px solid #555; cursor: pointer; font-size: 14px;
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function verifyPending(req, secret) {
  const cookies = parseCookies(req);
  const tok = cookies[COOKIE_PENDING];
  if (!tok) return null;
  try {
    const p = jwt.verify(tok, secret);
    if (p && p.purpose === 'artifacts_pending') return p;
  } catch (_) {
    /* ignore */
  }
  return null;
}

function verifyAuth(req, secret) {
  const cookies = parseCookies(req);
  const tok = cookies[COOKIE_AUTH];
  if (!tok) return null;
  try {
    const p = jwt.verify(tok, secret);
    if (p && p.purpose === 'artifacts_auth') return p;
  } catch (_) {
    /* ignore */
  }
  return null;
}

function loginFormHtml(errorMsg) {
  const err = errorMsg
    ? `<p style="color:#f88">${esc(errorMsg)}</p>`
    : '';
  return `
    <h1>Sign in — working artifacts</h1>
    ${err}
    <form method="post" action="${ARTIFACTS_BASE}/login">
      <label for="username">Username</label>
      <input type="text" name="username" id="username" autocomplete="username" required/>
      <label for="password">Password</label>
      <input type="password" name="password" id="password" autocomplete="current-password" required/>
      <button type="submit">Login</button>
    </form>`;
}

function registerArtifactsPortal(app, opts) {
  const { jwtSecret, listWorkingArtifacts, safeWorkingFilename, workingDir } = opts;
  const workingPath = `${ARTIFACTS_BASE}/working`;
  const loginPath = `${ARTIFACTS_BASE}/login`;

  const sendLoginPage = (req, res, errorMsg) => {
    res.type('html').send(pageShell('Login', loginFormHtml(errorMsg)));
  };

  app.get(loginPath, (req, res) => {
    if (verifyAuth(req, jwtSecret)) return res.redirect(302, workingPath);
    if (verifyPending(req, jwtSecret)) return res.redirect(302, workingPath);
    sendLoginPage(req, res, '');
  });

  app.get(workingPath, (req, res) => {
    if (!verifyAuth(req, jwtSecret)) {
      if (verifyPending(req, jwtSecret)) {
        const { question } = artifactsConfig();
        const body = `
          <h1>Security question</h1>
          <form method="post" action="${ARTIFACTS_BASE}/question">
            <label for="answer">${esc(question)}</label>
            <input type="password" name="answer" id="answer" autocomplete="off" required/>
            <button type="submit">Continue</button>
          </form>`;
        return res.type('html').send(pageShell('Verify', body));
      }
      return sendLoginPage(req, res, '');
    }

    const { files } = listWorkingArtifacts();
    const items = (files || [])
      .map((f) => {
        const href = `${ARTIFACTS_BASE}/download/${encodeURIComponent(f.name)}`;
        return `<li><a href="${esc(href)}">${esc(f.name)}</a></li>`;
      })
      .join('\n');
    const body = `
      <h1>Directory listing for /working/</h1>
      <ul>
        ${items || '<li><em>(empty — run npm run build:prod-exe on server)</em></li>'}
      </ul>
      <p style="margin-top:24px;font-size:13px;color:#888">
        <a href="${ARTIFACTS_BASE}/logout">Log out</a>
      </p>`;
    res.type('html').send(pageShell('Directory listing', body));
  });

  app.post(`${ARTIFACTS_BASE}/login`, (req, res) => {
    const cfg = artifactsConfig();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const userOk = username.toLowerCase() === cfg.user.toLowerCase();
    if (!userOk || password !== cfg.password) {
      return res.status(401).type('html').send(pageShell('Login', loginFormHtml('Invalid username or password.')));
    }
    const pending = jwt.sign({ purpose: 'artifacts_pending', sub: cfg.user }, jwtSecret, { expiresIn: '10m' });
    applyCookies(req, res, [
      { name: COOKIE_PENDING, value: pending, maxAge: 600 },
      { name: COOKIE_AUTH, clear: true },
    ]);
    res.redirect(302, workingPath);
  });

  app.post(`${ARTIFACTS_BASE}/question`, (req, res) => {
    if (!verifyPending(req, jwtSecret)) {
      return res.redirect(302, workingPath);
    }
    const cfg = artifactsConfig();
    const answer = String(req.body?.answer || '').trim();
    if (answer !== cfg.favoriteAnswer) {
      const body = `
        <h1>Security question</h1>
        <p style="color:#f88">Wrong answer.</p>
        <form method="post" action="${ARTIFACTS_BASE}/question">
          <label for="answer">${esc(cfg.question)}</label>
          <input type="password" name="answer" id="answer" required/>
          <button type="submit">Continue</button>
        </form>`;
      return res.status(401).type('html').send(pageShell('Verify', body));
    }
    const auth = jwt.sign({ purpose: 'artifacts_auth', sub: cfg.user }, jwtSecret, { expiresIn: '7d' });
    applyCookies(req, res, [
      { name: COOKIE_PENDING, clear: true },
      { name: COOKIE_AUTH, value: auth, maxAge: 7 * 86400 },
    ]);
    res.redirect(302, workingPath);
  });

  app.get(`${ARTIFACTS_BASE}/logout`, (req, res) => {
    applyCookies(req, res, [
      { name: COOKIE_PENDING, clear: true },
      { name: COOKIE_AUTH, clear: true },
    ]);
    res.redirect(302, workingPath);
  });

  app.get(`${ARTIFACTS_BASE}/download/:filename`, (req, res) => {
    if (!verifyAuth(req, jwtSecret)) {
      return res.redirect(302, workingPath);
    }
    const safe = safeWorkingFilename(req.params.filename);
    if (!safe) return res.status(400).send('Invalid filename');
    const abs = path.resolve(path.join(workingDir, safe));
    if (!abs.startsWith(path.resolve(workingDir))) {
      return res.status(400).send('Invalid path');
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).send('File not found');
    }
    res.download(abs, safe);
  });
}

module.exports = { registerArtifactsPortal, ARTIFACTS_BASE };
