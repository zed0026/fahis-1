# File Organization Feature

## Overview
The C2 server now automatically organizes downloaded files into client-specific directories, making it much easier to manage files from multiple connected PCs.

## How It Works

### 1. **Automatic Directory Creation**
- When a client connects, the server creates a unique directory for that client
- Directory naming format: `{Hostname}-{Username}` (e.g., `PC-Administrator`, `DESKTOP-John`)
- If username is unknown, uses just the hostname
- All special characters are replaced with underscores for filesystem safety

### 2. **File Organization**
- All files downloaded from a client are saved in their specific directory
- No more messy `downloads` folder with mixed files
- Each client's files are completely separated

### 3. **Directory Structure**
```
downloads/
├── PC-Administrator/
│   ├── data_186e466381e13a8c.zip
│   ├── screenshot_001.png
│   ├── document_resolved.pdf
│   └── ...
├── DESKTOP-John/
│   ├── browser_data.zip
│   ├── file_resolved.docx
│   └── ...
└── LAPTOP-Sarah/
    ├── extracted_data.zip
    └── ...
```

## API Changes

### 1. **Updated Downloads API**
- **GET /api/downloads** - Now returns organized structure:
```json
[
  {
    "clientDir": "PC-Administrator",
    "files": [
      {
        "filename": "data.zip",
        "clientDir": "PC-Administrator",
        "fullPath": "downloads/PC-Administrator/data.zip",
        "size": 1024000,
        "modified": "2024-01-15T10:30:00.000Z",
        "isDirectory": false
      }
    ],
    "totalFiles": 15,
    "totalSize": 52428800
  }
]
```

### 2. **Updated Download Endpoints**
- **GET /api/downloads/:clientDir/:filename** - Download specific file from client directory
- **GET /api/downloads/:filename** - Legacy endpoint (searches all client directories)

## Benefits

### 1. **Clean Organization**
- No more mixed files in downloads folder
- Easy to find files from specific clients
- Professional appearance

### 2. **Better Management**
- Clear separation between different PCs
- Easy to identify which client downloaded what
- Simplified file management

### 3. **Scalability**
- Works with unlimited number of clients
- Each client gets their own space
- No file conflicts between clients

## Implementation Details

### 1. **Helper Functions**
- `getClientDownloadDir(clientId, client)` - Creates and returns client directory
- `getOrganizedFilePath(clientId, client, filename)` - Returns organized file path

### 2. **Automatic Directory Creation**
- Directories are created when first file is downloaded
- Uses `fs.mkdirSync(clientDir, { recursive: true })`
- Safe filename generation with character replacement

### 3. **Backward Compatibility**
- Legacy download endpoint still works
- Searches all client directories for files
- No breaking changes to existing functionality

## Usage Examples

### 1. **Client Connection**
When a client connects with:
- Hostname: `PC-ADMIN`
- Username: `Administrator`

The server creates: `downloads/PC-ADMIN-Administrator/`

### 2. **File Downloads**
All files from this client are saved to:
- `downloads/PC-ADMIN-Administrator/screenshot.png`
- `downloads/PC-ADMIN-Administrator/data.zip`
- `downloads/PC-ADMIN-Administrator/document_resolved.pdf`

### 3. **API Access**
```javascript
// Get all organized downloads
fetch('/api/downloads')
  .then(response => response.json())
  .then(data => {
    data.forEach(client => {
      console.log(`Client: ${client.clientDir}`);
      console.log(`Files: ${client.totalFiles}`);
      console.log(`Size: ${client.totalSize} bytes`);
    });
  });

// Download specific file
window.open('/api/downloads/PC-ADMIN-Administrator/data.zip');
```

## File Safety

### 1. **Filename Sanitization**
- Special characters replaced: `[<>:"/\\|?*]` → `_`
- Prevents filesystem issues
- Maintains readability

### 2. **Path Security**
- Uses `path.join()` for safe path construction
- Prevents directory traversal attacks
- Validates file existence before operations

## Migration

### 1. **Existing Files**
- Old files in root `downloads/` folder remain accessible
- New files are organized automatically
- No data loss during transition

### 2. **Client Reconnection**
- Same client always uses same directory
- Consistent organization across sessions
- Persistent file storage

## Troubleshooting

### 1. **Directory Creation Issues**
- Check filesystem permissions
- Ensure `downloads/` folder exists
- Verify client information is available

### 2. **File Access Problems**
- Use correct API endpoint format
- Check client directory name
- Verify file exists in expected location

### 3. **Special Characters**
- Client names with special characters are sanitized
- Check directory names for underscores
- Use API to get exact directory names

## Future Enhancements

### 1. **Subdirectory Organization**
- Organize by file type within client directories
- Date-based subdirectories
- Custom organization rules

### 2. **File Management**
- Bulk file operations
- File search across clients
- Automatic cleanup of old files

### 3. **Client Information**
- Display client details in file listings
- Connection history per client
- File statistics and analytics

This feature significantly improves the organization and management of downloaded files, making the C2 server much more professional and user-friendly.
