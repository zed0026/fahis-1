//go:build windows

package main

import "golang.org/x/sys/windows"

var (
	kernel32NP = windows.NewLazySystemDLL("kernel32.dll")
	advapi32NP = windows.NewLazySystemDLL("advapi32.dll")

	procCreateNamedPipeW           = kernel32NP.NewProc("CreateNamedPipeW")
	procConnectNamedPipe           = kernel32NP.NewProc("ConnectNamedPipe")
	procDisconnectNamedPipe        = kernel32NP.NewProc("DisconnectNamedPipe")
	procImpersonateNamedPipeClient = advapi32NP.NewProc("ImpersonateNamedPipeClient")
	procRevertToSelf               = advapi32NP.NewProc("RevertToSelf")
	procVirtualQuery               = kernel32NP.NewProc("VirtualQuery")
	procGetProcessHeap             = kernel32NP.NewProc("GetProcessHeap")
	procHeapAlloc                  = kernel32NP.NewProc("HeapAlloc")
	procGetModuleHandleW           = kernel32NP.NewProc("GetModuleHandleW")
)

const (
	PIPE_ACCESS_DUPLEX        = 0x00000003
	FILE_FLAG_OVERLAPPED      = 0x40000000
	PIPE_UNLIMITED_INSTANCES  = 255
	PIPE_BUFFER_SIZE          = 4096
	STEAL_TOKEN_ACCESS        = 0x000F01FF
	TOKEN_QUERY               = 0x0008
	TOKEN_DUPLICATE           = 0x0002
	PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
	processDupHandle          = 0x0040
)
