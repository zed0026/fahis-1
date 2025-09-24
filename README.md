## ZED26 GUI C2

Interactive Command-and-Control server with a React-based GUI. The server exposes WebSocket and HTTP APIs, and the GUI provides dashboards for client management, terminal interaction, file transfers, screenshots, and settings.

> Educational/administrative use only. Ensure you have explicit authorization before connecting any clients.

---

## Features

- **Dashboard**: Overview of connected clients and activity
- **Clients**: List, status, and details of agents
- **Terminal**: Send commands and view responses in real time
- **File Manager**: Upload/download files via the server
- **Screenshots**: Interface for screenshot retrieval
- **Settings**: Manage server settings persisted in `c2.sqlite`

---

## Tech Stack

- **Server**: Node.js, Express, Socket.IO, `sql.js` (SQLite in WASM), Multer
- **Client**: React (Create React App), React Router, Styled Components, React Toastify

---

## Project Structure

```text
.
├─ server.js                 # Express + Socket.IO + TCP server + REST API
├─ c2.sqlite                 # Settings DB (created at runtime if missing)
├─ uploads/                  # Upload destination (created at runtime)
├─ downloads/                # Downloads served to GUI (created at runtime)
├─ client/                   # React application
│  ├─ public/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ App.js
│  │  └─ index.js
│  └─ build/                 # Production build output
└─ package.json              # Root scripts for server + client workflows
```

---

## Prerequisites

- Node.js 18+ and npm
- Windows, macOS, or Linux

---

## Installation

### One-liner

```bash
npm run install-all
```

### Manual

```bash
npm install          # install server deps
cd client && npm install
```

---

## Running the App

### Development (recommended during changes)

- Start the backend with auto-reload:

```bash
npm run dev
```

- In a separate terminal, start the React dev server:

```bash
npm run client
```

Notes:
- The React app runs on `http://localhost:3000` and proxies API requests to `http://localhost:5000` (see `client/package.json` `proxy`).
- WebSocket CORS is configured for `http://localhost:3000`.

### Production (single process serving the built client)

```bash
npm run build   # builds client into client/build
npm start       # starts Express on PORT (default 5000) and serves the built UI
```

Then open `http://localhost:5000`.

---

## Configuration

- Create a `.env` at the project root (see `.env.example`):

```bash
HOST=0.0.0.0        # bind address for HTTP server
PORT=5000           # HTTP server port
CORS_ORIGIN=http://localhost:3000  # allowed browser origin
TCP_HOST=0.0.0.0    # TCP listener host for agents
TCP_PORT=2026       # TCP listener port for agents
```

- **Env overrides settings**: `TCP_HOST`/`TCP_PORT` override DB settings on start.
- **Defaults if unset**: host `0.0.0.0`, HTTP port `5000`, CORS origin `http://localhost:3000`.
- **Settings UI**: Changing host/port via the API/UI will hot-restart the TCP server, unless env vars force a value.

---

## API Endpoints (HTTP)

- `GET /api/settings` → returns effective settings
- `PUT /api/settings` → updates settings (JSON body), hot-restarts TCP server if needed
- `GET /api/clients` → list of known clients
- `GET /api/clients/:id/history` → per-client session entries
- `POST /api/upload` (multipart `file`) → uploads file to `uploads/`
- `GET /api/downloads/:filename` → downloads a file from `downloads/`

WebSocket events are emitted on client connections, command responses, etc. See `server.js` for details (`clientConnected`, `clientDisconnected`, `commandResponse`, ...).

---

## Available Scripts

Root `package.json`:

- `npm start` → Start server (serves production UI if built)
- `npm run dev` → Start server with `nodemon`
- `npm run client` → Start React dev server
- `npm run build` → Build React app
- `npm run install-all` → Install root and client dependencies

### Credentials management

- Set or update admin credentials:

```bash
node credential.js set <username> <password>
```

- Delete a user:

```bash
node credential.js delete <username>
```

- List users:

```bash
node credential.js list
```

Client `package.json`:

- `npm start` → React dev server (CRA)
- `npm run build` → Production build into `client/build`
- `npm test`, `npm run eject` → standard CRA scripts

---

## Data & Persistence

- Settings are stored in `c2.sqlite` using `sql.js` (no native SQLite dependency).
- Uploads land in `uploads/` and downloadable artifacts are expected in `downloads/`.

Both folders and the DB are created at first run if missing.

---

## Troubleshooting

- GUI not loading in production:
  - Ensure you ran `npm run build` and then `npm start`.
- CORS/WebSocket issues in development:
  - Access the UI via `http://localhost:3000` and keep the server on `http://localhost:5000`.
- Port conflicts:
  - Set a different `PORT` env var when starting the server, e.g. `PORT=5050 npm start`.

---

## Authentication

- The server exposes `POST /api/login` for obtaining a JWT.
- Use `node credential.js set <user> <pass>` to create the first user.
- The React app shows a login screen. On success, the token is saved in `localStorage` as `c2_token`.
- Socket.IO connections include the token in `auth.token`.

---

## License

MIT © ZED26

---

## Important Notice

This project can interact with remote machines. Operate only in controlled environments and with explicit permission. The authors and contributors are not responsible for misuse.


