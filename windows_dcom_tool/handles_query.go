//go:build windows

package main

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	systemExtendedHandleInformation = 0x40
	statusInfoLengthMismatch        = 0xC0000004
)

type systemHandleEntry struct {
	ObjectPtr       uintptr
	OwnerPID        uintptr
	HandleValue     uintptr
	GrantedAccess   uint32
	CreatorBack     uint16
	ObjectTypeIndex uint16
	HandleAttrs     uint32
	Reserved        uint32
}

var (
	ntdllForHandles           = windows.NewLazySystemDLL("ntdll.dll")
	procNtQuerySysInfoHandles = ntdllForHandles.NewProc("NtQuerySystemInformation")
	procNtDuplicateObjHandles = ntdllForHandles.NewProc("NtDuplicateObject")
)

func querySystemHandles() ([]systemHandleEntry, error) {
	bufSize := uint32(2 * 1024 * 1024)
	for attempts := 0; attempts < 8; attempts++ {
		buf := make([]byte, bufSize)
		var retLen uint32
		ret, _, _ := procNtQuerySysInfoHandles.Call(
			uintptr(systemExtendedHandleInformation),
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(bufSize),
			uintptr(unsafe.Pointer(&retLen)),
		)
		st := uint32(ret)
		if st == statusInfoLengthMismatch {
			if retLen > bufSize {
				bufSize = retLen + 65536
			} else {
				bufSize *= 2
			}
			continue
		}
		if st != 0 {
			return nil, fmt.Errorf("NtQuerySystemInformation: 0x%X", st)
		}
		count := *(*uintptr)(unsafe.Pointer(&buf[0]))
		entrySize := unsafe.Sizeof(systemHandleEntry{})
		header := unsafe.Sizeof(uintptr(0)) * 2
		max := (uintptr(bufSize) - header) / entrySize
		if uintptr(count) > max {
			count = max
		}
		out := make([]systemHandleEntry, count)
		base := uintptr(unsafe.Pointer(&buf[0])) + header
		for i := uintptr(0); i < count; i++ {
			out[i] = *(*systemHandleEntry)(unsafe.Pointer(base + i*entrySize))
		}
		return out, nil
	}
	return nil, fmt.Errorf("querySystemHandles: buffer growth failed")
}
