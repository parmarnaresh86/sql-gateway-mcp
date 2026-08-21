# SQL Gateway MCP

An MCP server hosted on Render that lets any MCP client (ChatGPT Developer
Mode, Claude, Cursor, etc.) query a local database — without ever exposing a
port or IP on the machine that holds the data. Same idea as the Power BI
on-premises data gateway: the local machine always calls **out**, never
accepts inbound connections.

## Architecture

```
ChatGPT / Claude / any MCP client
        │  HTTPS (MCP protocol)
        ▼
Render: mcp-server            <- always public, always on
        │  WebSocket (outbound FROM the local PC side)
        ▼
local-agent  (runs on any PC, identified by a CONNECTOR_ID)
        │
        ▼
Local SQL database
```

- The **MCP server** on Render never touches a database directly. It only
  forwards named, allowlisted tool calls to whichever local connector is
  currently registered, then returns the result.
- The **local agent** dials out to Render and stays connected. No inbound
  port, no static IP, no port forwarding.
- One Render deployment can serve **multiple connectors** at once (multiple
  PCs/DBs), each with its own ID + token. A tool call specifies which
  `connectorId` to talk to.

## Project structure

```
sql-gateway-mcp/
├── render-mcp-server/
│   ├── server.js            # MCP server: tool definitions (list_connectors, run_named_query)
│   ├── agentRelay.js        # WebSocket hub: tracks connected connectors, routes jobs, matches replies
│   ├── package.json
│   └── render.yaml          # Render blueprint for one-click deploy
│
├── local-agent/
│   ├── agent.js              # Connects outbound to Render, listens for jobs, runs them, replies
│   ├── db.js                 # DB driver abstraction (mysql / postgres / mssql / sqlite)
│   ├── queries.js            # ALLOWLIST — only named, parameterized queries the agent will ever run
│   ├── package.json
│   ├── .env.example
│   ├── install.ps1           # One-touch installer, Windows
│   └── install.sh            # One-touch installer, Linux/macOS
│
└── README.md
```

## Key rules to keep

- Named, parameterized queries only — never raw SQL from the network side.
- Every connector has its own unique ID + strong random token.
- The agent decides what it's willing to run, independent of what the server
  asks for — defense in depth.
- Outbound-only from every local machine, always.

## Hosting on Render

1. Push this repo to GitHub.
2. Render → New → Blueprint (uses `render-mcp-server/render.yaml`), or
   manually: New Web Service, root directory `render-mcp-server`, build
   command `npm install`, start command `npm start`.
3. Set env var `CONNECTOR_TOKENS` in the Render dashboard:
   `id1:token1,id2:token2,...` (generate each token with
   `openssl rand -hex 32`).
4. Deploy. Your endpoints become:
   - MCP: `https://<your-app>.onrender.com/mcp`
   - Agent relay: `wss://<your-app>.onrender.com/agent`
   - Health check: `https://<your-app>.onrender.com/healthz`

## Setting up a local connector

On the PC that holds the database:

1. Copy the `local-agent/` folder to that machine.
2. Fill in `queries.js` with your real named, parameterized queries (see the
   comment at the top of that file for placeholder syntax per engine).
3. Run the installer:
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
   - Linux/macOS: `chmod +x install.sh && ./install.sh`
4. The installer prompts for the Render URL, connector ID, token, and DB
   credentials (writing `.env`), installs dependencies, and runs the agent
   under `pm2` as a background service named `sql-connector`.

Useful `pm2` commands afterward:

```
pm2 status
pm2 logs sql-connector
pm2 restart sql-connector
```

## Adding a new connector later

Run the installer on the new machine with a new `CONNECTOR_ID`, add
`newid:newtoken` to Render's `CONNECTOR_TOKENS`, and save (Render restarts
the service automatically on env var changes). No code changes needed on
either side.

## Connecting an MCP client

- **ChatGPT Developer Mode**: Settings → Connectors → Developer Mode → Add
  custom connector → URL = `https://<your-app>.onrender.com/mcp`.
- **Claude / Cursor / other MCP clients**: point them at the same
  `https://<your-app>.onrender.com/mcp` endpoint.

Once connected, ask the client to `list_connectors` to confirm which PCs are
online, then `run_named_query` with a `connectorId` and one of the query
names defined in that connector's `queries.js`.
