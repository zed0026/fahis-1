//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

func checkPrivilege(name string) bool {
	var tok windows.Token
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &tok); err != nil {
		return false
	}
	defer tok.Close()
	privName, _ := windows.UTF16PtrFromString(name)
	var luid windows.LUID
	if err := windows.LookupPrivilegeValue(nil, privName, &luid); err != nil {
		return false
	}
	var needed uint32
	_ = windows.GetTokenInformation(tok, windows.TokenPrivileges, nil, 0, &needed)
	if needed == 0 {
		return true
	}
	buf := make([]byte, needed)
	if err := windows.GetTokenInformation(tok, windows.TokenPrivileges, &buf[0], needed, &needed); err != nil {
		return true
	}
	tp := (*windows.Tokenprivileges)(unsafe.Pointer(&buf[0]))
	for i := 0; i < int(tp.PrivilegeCount); i++ {
		p := tp.Privileges[i]
		if p.Luid.LowPart == luid.LowPart && p.Luid.HighPart == luid.HighPart {
			return p.Attributes&windows.SE_PRIVILEGE_ENABLED != 0
		}
	}
	return false
}

func clientLabel() string {
	var tok windows.Token
	err := windows.OpenThreadToken(windows.CurrentThread(), windows.TOKEN_QUERY, true, &tok)
	if err != nil {
		var pt windows.Token
		if err2 := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &pt); err2 != nil {
			return "?"
		}
		defer pt.Close()
		return tokenUserString(pt)
	}
	defer tok.Close()
	return tokenUserString(tok)
}

func tokenUserString(tok windows.Token) string {
	u, err := tok.GetTokenUser()
	if err != nil {
		return "?"
	}
	return u.User.Sid.String()
}
