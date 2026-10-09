//go:build !windows

package main

import "os/exec"

func setHiddenWindow(cmd *exec.Cmd) {
	_ = cmd
}

func platformCheckDebug() bool {
	return false
}

func platformHideTerminal() {}

func platformTakeSnapshot() string {
	return "Snapshot only supported on Windows"
}
