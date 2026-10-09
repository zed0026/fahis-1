#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

(async () => {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'c2.sqlite');
  let db;
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }
  // ensure users table + email column for OTP
  db.run(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', email TEXT DEFAULT '');`);
  try {
    const cols = [];
    const info = db.exec('PRAGMA table_info(users)');
    if (info[0] && info[0].values) info[0].values.forEach((row) => cols.push(row[1]));
    if (!cols.includes('email')) db.run(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''`);
  } catch (_) { /* ignore */ }

  const args = process.argv.slice(2);
  const action = args[0];
  if (!action || !['set', 'delete', 'list'].includes(action)) {
    console.log('Usage: node credential.js <set|delete|list> [username] [password] [email]');
    process.exit(1);
  }

  if (action === 'list') {
    const res = [];
    const stmt = db.prepare('SELECT username, role, email FROM users');
    while (stmt.step()) res.push(stmt.getAsObject());
    console.table(res);
  } else if (action === 'delete') {
    const username = args[1];
    if (!username) {
      console.error('username required');
      process.exit(1);
    }
    const del = db.prepare('DELETE FROM users WHERE username = ?');
    del.run([username]);
    console.log(`Deleted user ${username}`);
  } else if (action === 'set') {
    const username = args[1];
    const password = args[2];
    const email = (args[3] || '').trim().toLowerCase();
    if (!username || !password) {
      console.error('username and password required');
      process.exit(1);
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    let role = 'admin';
    let existingEmail = '';
    const existing = db.prepare('SELECT role, email FROM users WHERE username = ?');
    existing.bind([username]);
    if (existing.step()) {
      const row = existing.getAsObject();
      role = row.role || 'admin';
      existingEmail = row.email || '';
    }
    existing.free();
    const emailFinal = email || existingEmail || '';
    const upsert = db.prepare('INSERT OR REPLACE INTO users (username, passwordHash, role, email) VALUES (?, ?, ?, ?)');
    upsert.run([username, passwordHash, role, emailFinal]);
    upsert.free();
    console.log(`Set credentials for ${username}${emailFinal ? ` (email: ${emailFinal})` : ''}`);
    console.log('Tip: If the C2 server is already running, log in again — it reloads users from c2.sqlite on each login.');
  }

  // persist DB
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
})();


