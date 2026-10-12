//go:build windows

package main

// Mirrors Crystal Config.debug_level (0=quiet, 1=-d, 2=-dd).
var dcomDebugLevel int

func dcomDebug() bool  { return dcomDebugLevel >= 1 }
func dcomVerbose() bool { return dcomDebugLevel >= 2 }
