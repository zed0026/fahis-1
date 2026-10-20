# Fahis / ZED26 C2 — System Kaise Kaam Karti Hai (Roman Urdu)

Yeh document explain karta hai ke poora platform kya hai, files ka role kya hai, communication ka flow kya hai, aur builder mein kaun si techniques use hoti hain. **Sirf authorized testing / apni lab ke liye.**

---

## 1. High-level picture (mukhtasar)

Teen main hissay hain:

| Hissa | Kya hai | Kaun use karta hai |
|--------|---------|-------------------|
| **Dashboard (GUI)** | React web app — sessions, terminal, files, builder | Operator (tum) |
| **Teamserver** | Node.js `server.js` — HTTP API + Socket.IO + implant TCP | Server par chalta hai |
| **Implant** | Go binary (`lastfinalversion2.go` se build) | Target machine par |

```
[Operator Browser]  <--Socket.IO + REST-->  [server.js]
                                                |
                                                | TCP (JSON lines)
                                                v
                                         [Go Implant on target]
```

- **Operators** dashboard se commands bhejte hain.
- **Implant** teamserver se **alag TCP port** par connect hota hai (aksar `2026`, `.env` se `TCP_PORT`).
- **HTTP port** (aksar `5000`) sirf web UI aur API ke liye hai — implant wahan connect nahi karta.

---

## 2. Communication kaise hoti hai

### 2.1 Implant ↔ Teamserver (TCP)

- File: **`server.js`** — TCP listener section (`[TCP]` logs).
- Implant **`lastfinalversion2.go`** mein `net.Dial` se C2 host/port par connect karta hai.
- Har message **ek line par JSON** (newline-separated):
  - Implant se: `type` / `Type`, `content` / `Content`, kabhi `hostname`, `username`, `os`, etc.
  - Server se implant ko: `{ "type": "command", "content": "pwd" }` jaisi lines.

**Pehli registration:** Jab implant `hostname` bhejta hai, server:
- Client ko `clients` Map mein register karta hai.
- Database mein session save karta hai (`credential.js` / sql.js).
- GUI ko `clientConnected` event Socket.IO se bhejta hai.
- Optional: auto `setpersistence` (Windows), sleep prefs dubara lagana, email alert.

**Commands:** Dashboard `executeCommand` Socket.IO event → server implant ke TCP socket par JSON command likhta hai → implant response wapas JSON line mein bhejta hai → server `commandResponse` se GUI ko forward karta hai.

**File upload/download:** Terminal ya file manager se; server implant ko `upload` / `download` style commands aur binary stream handle karta hai (buffer logic `server.js` mein).

**SOCKS5:** Implant par `socks_open` / `socks_data` / `socks_close` wire messages; server **`socks5.js`** local SOCKS listener chalata hai aur traffic implant ke TCP tunnel se relay karta hai.

### 2.2 Operator ↔ Teamserver (HTTP + Socket.IO)

- **REST API** (`/api/...`) — login (JWT), builder generate/download, settings, user management.
- **Socket.IO** — live client list, command I/O, upload progress, SOCKS status.
- Files:
  - **`client/src/hooks/useSocket.js`** — browser socket connect.
  - **`client/src/hooks/useClients.js`** — clients list, naye session par auto `setpersistence` (Windows).
  - **`server.js`** — `io.on('connection', ...)` handlers.

### 2.3 C2 host/port implant mein

- Build time par **`builder/polymorph.js`** `obfC2Host` / `obfPortStr` ko XOR + Base64 + Hex se mutate karta hai.
- Runtime par `deobfuscateString()` se host/port nikalta hai (`lastfinalversion2.go`).
- Env override: `C2_HOST`, `C2_PORT` (agar set hon).

---

## 3. Implant techniques (Go agent)

File: **`lastfinalversion2.go`** (main logic) + platform files:

| File | Kaam |
|------|------|
| `lastfinalversion2.go` | Commands, C2 loop, encryption, browser extract, inject, persistence, SOCKS wire |
| `lastfinalversion2_platform_windows.go` | Windows-specific (hide window, registry, etc.) |
| `lastfinalversion2_platform_other.go` | Linux/macOS helpers |
| `embedded_dll_stub.go` | Local dev: khali embed; builder real DLL XOR embed karta hai |
| `lastfinalversion2_localtest.go` | `localtest` tag — local C2 defaults |

### 3.1 String obfuscation

- Har build par **naya `xorKey`** aur **`shiftValue`** (`builder/polymorph.js` → `mutateSource`).
- Commands (`pwd`, `upload`, `setpersistence`, …) **hex strings** mein; runtime `deobfuscateString()`.
- Sensitive names (jaise persistence task names) bhi obfuscated variables se aate hain.
- Windows API names kabhi **shift cipher** se (`shiftEncrypt` / `shiftDecrypt`).

### 3.2 Beacon / sleep

- `sleep <sec> <jitter>` command — implant beacon interval change.
- Server hostname+MAC par sleep prefs yaad rakhta hai (`beaconSleepPrefs` in `server.js`) taake reconnect par dubara apply ho.

### 3.3 Persistence (Windows)

- `setpersistence` — copy + HKCU Run (`ScService` style name obfuscated).
- Pehli connection par server/dashboard auto `setpersistence` bhej sakta hai.
- `removepersistence` / `checkpersistence` — hatao ya check karo.

### 3.4 Process inject / migrate

- Windows EXE build mein **inject DLL** embed hoti hai (XOR encrypted blob, `embedded_dll.go` build folder mein).
- `migrate <pid>` — embedded DLL temp mein drop, `LoadLibrary` style inject.
- **`builder/polymorph.js`** MinGW se `inject_payload.dll` banata hai, phir EXE mein pack.

### 3.5 Polymorphic build (har generation alag signature)

`builder/polymorph.js`:

- Source copy → keys/strings change → **poly junk** functions + `PolyBuildId`.
- **`garble`** (agar PATH par ho): `-literals -tiny` — literals/symbols obscure.
- **`-trimpath`**, **`-s -w`**, unique **`-buildid`**.
- PE ke end par **random padding** (hash change, loader ignore).
- Windows par **Authenticode** — `builder/signing.js` (lab cert / signtool).

---

## 4. Builder / Generator (dashboard)

UI: **`client/src/components/ImplantBuilder.js`**

Backend: **`builder/polymorph.js`** → `generateBuild()`

| Variant | Builder file | Output |
|---------|--------------|--------|
| Windows/Linux implant | `polymorph.js` | `.exe` / Linux binary |
| Windows DCOM tool | `dcom_go.js` | Go GodPotato-style EXE |
| Linux LinPEAS | `linpeas_build.js` | obfuscated `.sh` |
| Windows WinPEAS | `winpeas_build.js` | obfuscated `.bat` |

Build artifacts: **`builds/<id>/`** + **`builds/index.json`** manifest.

### 4.1 Signature Rotator (uploaded EXE)

- UI: **`client/src/components/ExeMutator.js`**
- Logic: **`builder/pe_mutate.js`** — PE timestamp, overlay padding, optional re-sign.
- API: `POST /api/builder/mutate`

---

## 5. Dashboard files (React) — kya karta hai

| File | Kaam |
|------|------|
| `client/src/App.js` | Main layout, views switch |
| `client/src/components/Login.js` | JWT login |
| `client/src/components/Dashboard.js` | Sessions list |
| `client/src/components/SessionView.js` | Ek session: terminal, files, SOCKS, etc. |
| `client/src/components/Terminal.js` | Command shell, history, upload; open par `pwd` |
| `client/src/components/FileManager.js` | Remote ls/cd/upload |
| `client/src/components/ImplantBuilder.js` | Implant / DCOM / LinPEAS / WinPEAS generate |
| `client/src/components/ExeMutator.js` | Uploaded binary mutate |
| `client/src/components/SocksPanel.js` | SOCKS5 start/stop |
| `client/src/components/UserManagement.js` | Dashboard users |
| `client/src/components/Sidebar.js` | Navigation tabs |

Build UI serve: `client/build/` static — `server.js` `express.static('client/build')`.

---

## 6. Server core files

| File | Kaam |
|------|------|
| **`server.js`** | Express, TCP C2, Socket.IO, builder APIs, file downloads, SOCKS orchestration |
| **`socks5.js`** | Local SOCKS5 + implant tunnel |
| **`credential.js`** | Users / auth DB helpers |
| **`package.json`** | Dependencies, `npm start` scripts |
| **`.env.local` / `.env.production`** | `TCP_PORT`, `PORT`, JWT, email, signing paths |

---

## 7. Windows DCOM tool (alag module)

Folder: **`windows_dcom_tool/`** — Go DCOM privilege escalation (GodPotato-style).

Builder: **`builder/dcom_go.js`** — polymorphic compile + sign, jaise implant.

Yeh C2 implant **nahi** hai; alag EXE generation tab se banta hai.

---

## 8. Enumeration scripts (LinPEAS / WinPEAS)

| Source | Builder | Output |
|--------|---------|--------|
| `linpeas.sh` | `builder/linpeas_build.js` | gzip + chunked wrapper `.sh` |
| `winPEAS.bat` | `builder/winpeas_build.js` | gzip + PowerShell decode `.bat` |

Har build unique chunk names / stamp — **sha256 alag**.

---

## 9. Typical operator flow (ek session)

1. Teamserver chalao: `npm start` (ya PM2).
2. Browser → login → **Dashboard** par naya session dikhe.
3. Session kholo → **Terminal** automatically `pwd` bhej sakta hai; Windows par `setpersistence` auto ho sakta hai.
4. Commands: `sysinfo`, `processes`, `migrate <pid>`, `sleep 10 20`, etc.
5. Naya implant chahiye → **Generate Implant** → download → target par run.
6. AV signature change → naya build generate karo (polymorph) ya **Signature Rotator** se uploaded EXE mutate.

---

## 10. Important env / ports (yaad rakho)

- **`PORT`** — HTTP (dashboard + API).
- **`TCP_PORT` / `TCP_HOST`** — implant listener (alag port rakho HTTP se).
- **`BUILD_C2_HOST` / `BUILD_C2_PORT`** — builder default C2 embed ke liye.
- JWT secret — login tokens ke liye (`.env`).

---

## 11. Purani / backup Go files

Repo mein `V3.go`, `backup.go`, `code.go`, `v3backup.go` — **purane versions**; production builder **`lastfinalversion2.go`** use karta hai. In ko confuse mat karo current build se.

---

## 12. Techniques summary (ek nazar mein)

| Technique | Kahan |
|-----------|--------|
| XOR + Base64 + Hex strings | `lastfinalversion2.go` + `polymorph.js` |
| Per-build key rotation | `polymorph.js` `mutateSource` |
| Garble literals/tiny | `polymorph.js` compile (agar installed) |
| PE overlay padding | `polymorph.js`, `pe_mutate.js` |
| XOR encrypted embedded DLL | `polymorph.js` `writeEncryptedEmbeddedDll` |
| Authenticode signing | `builder/signing.js` |
| JSON line protocol over TCP | `server.js` + implant |
| Socket.IO real-time UI | `server.js` + React hooks |
| SOCKS5 over C2 mux | `socks5.js` + implant `socks_*` messages |
| Polymorphic PEAS wrappers | `linpeas_build.js`, `winpeas_build.js` |

---

## 13. Agar build fail ho

- **Garble missing** → normal `go build` fallback (thori kam obfuscation).
- **MinGW missing** → Windows EXE bina embedded inject DLL (migrate limited).
- **Signing** → sirf Windows teamserver + signtool; warn aaye to unsigned build phir bhi download hota hai.
- **`-buildvcs`** → linker par use mat karo; purane Go versions support nahi karte (project se hata diya gaya).

---

*Document version: project state ke mutabiq — Roman Urdu mein samjhane ke liye. Technical terms English mein rehne diye hain kyun ke codebase bhi English identifiers use karta hai.*
