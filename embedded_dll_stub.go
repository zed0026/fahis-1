package main

// embeddedInjectDLL holds the companion inject payload (Windows DLL).
// The dashboard builder overwrites this file with //go:embed of a real DLL.
// Default empty => migrate/injectdll explain that a fresh build is required.
var embeddedInjectDLL []byte
