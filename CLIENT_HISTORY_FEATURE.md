# CLIENT HISTORY & DATABASE PERSISTENCE

## 🎯 **Feature Overview**

Client information is now **permanently saved** in the SQLite database. When the server restarts, all client history, sessions, and commands are preserved!

---

## ✅ **What's Been Implemented**

### **1. Database Tables Created:**

#### **`clients` Table:**
Stores all clients that have ever connected
- `id` - Unique client identifier
- `hostname` - Computer name
- `username` - User account name
- `os` - Operating system
- `ip` - IP address
- `macAddress` - MAC address
- `firstSeen` - First connection timestamp
- `lastSeen` - Last seen timestamp
- `totalConnections` - Total number of connections
- `status` - Current status (online/offline)

#### **`client_sessions` Table:**
Tracks individual connection sessions
- `sessionId` - Unique session identifier
- `clientId` - Foreign key to clients table
- `connectTime` - Session start timestamp
- `disconnectTime` - Session end timestamp
- `ipAddress` - Connection IP
- `duration` - Session duration in seconds

#### **`client_commands` Table:**
Logs all commands executed
- `id` - Auto-increment ID
- `clientId` - Foreign key to clients table
- `sessionId` - Foreign key to client_sessions
- `command` - The command executed
- `timestamp` - When command was executed
- `response` - Command response (truncated to 1000 chars)

---

## 🚀 **How It Works**

### **When Client Connects:**
1. ✅ Server receives client information
2. ✅ Checks if client exists in database
3. ✅ **If new**: Creates new client record with `firstSeen` timestamp
4. ✅ **If existing**: Updates `lastSeen`, increments `totalConnections`
5. ✅ Creates new session record
6. ✅ Marks client status as `online`

### **During Session:**
1. ✅ All commands are logged to database
2. ✅ Command responses saved (truncated)
3. ✅ Session activity tracked

### **When Client Disconnects:**
1. ✅ Closes session record with duration
2. ✅ Marks client status as `offline`
3. ✅ Data persists in database

### **When Server Restarts:**
1. ✅ All client data loaded from database
2. ✅ Historical clients remain visible
3. ✅ Connection history preserved
4. ✅ Command logs accessible

---

## 📊 **API Endpoints**

### **GET `/api/clients`**
Returns **merged list** of clients:
- Currently connected clients (status: `online`)
- Historical clients from database (status: `offline`)

**Response:**
```json
[
  {
    "id": "uuid",
    "hostname": "DESKTOP-ABC123",
    "username": "Administrator",
    "macAddress": "00:11:22:33:44:55",
    "os": "Windows 10",
    "ip": "192.168.1.100",
    "firstSeen": "2025-01-15T10:30:00Z",
    "lastSeen": "2025-01-15T14:45:00Z",
    "totalConnections": 5,
    "status": "online"
  },
  {
    "id": "uuid2",
    "hostname": "LAPTOP-XYZ",
    "username": "User",
    "macAddress": "AA:BB:CC:DD:EE:FF",
    "os": "Windows 11",
    "ip": "192.168.1.101",
    "firstSeen": "2025-01-14T08:00:00Z",
    "lastSeen": "2025-01-14T18:00:00Z",
    "totalConnections": 3,
    "status": "offline"
  }
]
```

### **GET `/api/clients/:id/history`**
Returns complete history for a specific client:
- Current session data
- All past sessions
- All executed commands

**Response:**
```json
{
  "currentSession": [
    {
      "timestamp": "2025-01-15T14:30:00Z",
      "type": "command",
      "content": "sysinfo"
    }
  ],
  "sessions": [
    {
      "sessionId": "session-uuid",
      "clientId": "client-uuid",
      "connectTime": "2025-01-15T14:00:00Z",
      "disconnectTime": "2025-01-15T14:45:00Z",
      "ipAddress": "192.168.1.100",
      "duration": 2700
    }
  ],
  "commands": [
    {
      "id": 1,
      "clientId": "client-uuid",
      "sessionId": "session-uuid",
      "command": "sysinfo",
      "timestamp": "2025-01-15T14:30:00Z",
      "response": "OS: Windows 10..."
    }
  ]
}
```

---

## 🎯 **UI/Dashboard Integration**

The API endpoints are ready for your React UI to consume:

### **Dashboard - Clients List:**
```javascript
// Fetch all clients (online + offline)
fetch('/api/clients')
  .then(res => res.json())
  .then(clients => {
    // clients array includes both online and offline
    // Filter by status:
    const online = clients.filter(c => c.status === 'online');
    const offline = clients.filter(c => c.status === 'offline');
  });
```

### **Client Detail - History:**
```javascript
// Fetch client history
fetch(`/api/clients/${clientId}/history`)
  .then(res => res.json())
  .then(history => {
    // history.sessions - all connection sessions
    // history.commands - all executed commands
    // history.currentSession - current session data
  });
```

---

## 📊 **Database File**

**Location:** `c2.sqlite` (in project root)

**Benefits:**
- ✅ Persistent storage
- ✅ Survives server restarts
- ✅ No external database needed
- ✅ Easy to backup
- ✅ Portable

**To backup:**
```bash
cp c2.sqlite c2_backup.sqlite
```

---

## 🔍 **Console Output**

### **When Client Connects:**
```
[TCP] New client connected: 192.168.1.100
[TCP] Client registered: DESKTOP-ABC123 (Administrator)
[DB] Client saved: uuid (DESKTOP-ABC123)
[DB] Session created: session-uuid for client uuid
```

### **When Client Disconnects:**
```
[TCP] Client disconnected: 192.168.1.100
[DB] Session closed: session-uuid (Duration: 2700s)
[DB] Client marked offline: uuid
```

### **When Command Executed:**
```
[DB] Command logged: sysinfo for client uuid
```

---

## 📈 **Statistics Available**

From the database, you can now track:

### **Per Client:**
- Total connections ever
- First seen date
- Last seen date
- Total session time
- Number of commands executed
- Connection patterns

### **Overall:**
- Total unique clients
- Currently active clients
- Historical client count
- Most active clients
- Command usage patterns

---

## 🎯 **Example Queries**

### **Get Most Active Clients:**
```javascript
const clients = getAllClientsFromDb();
clients.sort((a, b) => b.totalConnections - a.totalConnections);
console.log('Top 10 most active:', clients.slice(0, 10));
```

### **Get Recent Sessions:**
```javascript
const history = getClientHistory(clientId);
console.log('Last 10 sessions:', history.sessions.slice(0, 10));
```

### **Get Command History:**
```javascript
const history = getClientHistory(clientId);
console.log('Last 100 commands:', history.commands);
```

---

## ✅ **What's Preserved After Server Restart**

### **✅ Preserved:**
- All client information (hostname, username, IP, MAC, OS)
- First seen timestamp
- Last seen timestamp
- Total connection count
- All session history (connect/disconnect times, durations)
- All command history
- Client status (online/offline)

### **❌ Not Preserved:**
- Active TCP connections (need to reconnect)
- In-memory command buffer
- File transfer progress
- Real-time output streams

---

## 🎉 **Benefits**

### **1. Persistence:**
- ✅ Data survives server crashes
- ✅ Data survives server restarts
- ✅ Historical tracking

### **2. Analytics:**
- ✅ Track client behavior
- ✅ Connection patterns
- ✅ Command usage
- ✅ Session durations

### **3. Forensics:**
- ✅ Complete audit trail
- ✅ Command history
- ✅ Connection timeline
- ✅ IP address history

### **4. Management:**
- ✅ See all clients ever connected
- ✅ Identify inactive clients
- ✅ Track total connections
- ✅ Monitor usage patterns

---

## 🔧 **Migration**

If you have an existing `c2.sqlite` file, the new tables will be created automatically when the server starts. No manual migration needed!

---

## 📝 **Usage Summary**

### **For Server Operators:**
- **No action needed** - Everything is automatic
- Client history is saved automatically
- Database is created/updated automatically
- Just restart server and it works!

### **For UI Developers:**
- Use `/api/clients` for clients list (includes historical)
- Use `/api/clients/:id/history` for detailed history
- Filter by `status` field to show online/offline
- Display `totalConnections`, `firstSeen`, `lastSeen`

---

## 🎯 **Quick Start**

1. **Restart server:**
   ```bash
   node server.js
   ```

2. **Connect clients** (they'll be saved automatically)

3. **Restart server again** - clients are still there!

4. **Check API:**
   ```bash
   curl http://localhost:3001/api/clients
   ```

5. **See history:**
   ```bash
   curl http://localhost:3001/api/clients/<client-id>/history
   ```

---

## ✅ **Feature Complete!**

**Client data is now persistent!** 🎉

No more lost history after server restarts. Everything is saved, tracked, and retrievable!

