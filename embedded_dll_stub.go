package main

// embeddedInjectDLLBytes returns the companion inject payload (Windows DLL).
// The dashboard builder overwrites embedded_dll.go with an XOR-encrypted //go:embed blob.
func embeddedInjectDLLBytes() []byte {
	return nil
}
