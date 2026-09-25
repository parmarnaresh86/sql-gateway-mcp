# SQL Gateway MCP

An MCP server hosted on Render that lets any MCP client (ChatGPT Developer
Mode, Claude, Cursor, etc.) query a local/on-prem database — without ever
exposing a port or IP on the machine that holds the data. Same idea as the
Power BI on-premises data gateway: the local machine always calls **out**,
never accepts inbound connections.

## Architecture

```
ChatGPT / Claude / any MCP client
        │  HTTPS, requires ?key=<MCP_ACCESS_TOKEN> or Authorization: Bearer
        ▼
Render: sql-gateway-mcp-server        <- always public, always on
        │  tools: list_connectors, run_named_query, run_sql_query
        │
        │  WebSocket (outbound FROM the local PC side only)
        ▼
local-agent  (runs on any PC, identified by a CONNECTOR_ID + CONNECTOR_TOKEN)
        │  enforces read-only (SELECT/WITH only) on ad-hoc SQL,
        │  independent of what the server/client asked for
        ▼
Local database  (SQL Server / MySQL / Postgres / SQLite / SAP HANA)
```

**Trust boundary, end to end:**

1. **Client → Render**: gated by `MCP_ACCESS_TOKEN` (a shared secret). Without
   it, anyone with the URL could call tools — this must be set for any real
   deployment.
2. **Render → local-agent**: gated by `CONNECTOR_TOKENS` — each PC has its own
   `connectorId:token` pair. Render only forwards a job to a connector that's
   currently online and matches the ID the tool call asked for.
3. **local-agent → database**: the agent decides what it's willing to run,
   *regardless* of what Render/the client sent. Named queries are limited to
   an explicit allowlist (`queries.js`); ad-hoc SQL (`run_sql_query`) is
   restricted to a single read-only `SELECT`/`WITH` statement, with DDL/DML
   keywords blocked (`sqlGuard.js`). This is defense in depth — even if the
   server side were ever compromised, the agent still won't run a write.

The local machine never opens an inbound port. It dials out over WebSocket
and stays connected; if it drops, it reconnects with exponential backoff.
One Render deployment serves **multiple connectors** at once (multiple
PCs/DBs) — a tool call specifies which `connectorId` to target.

## Project structure

```
sql-gateway-mcp/
├── render-mcp-server/
│   ├── server.js            # MCP server + tool definitions + MCP_ACCESS_TOKEN auth gate
│   ├── agentRelay.js        # WebSocket hub: tracks connected connectors, routes jobs, matches replies
│   ├── package.json
│   └── render.yaml          # Render blueprint for one-click deploy
│
├── local-agent/
│   ├── agent.js              # Connects outbound to Render, listens for jobs, runs them, replies
│   ├── db.js                 # DB driver abstraction (mysql / postgres / mssql / hana / sqlite)
│   ├── sqlGuard.js           # Read-only enforcement for ad-hoc SQL (run_sql_query)
│   ├── queries.js            # ALLOWLIST — named, parameterized queries (used by run_named_query)
│   ├── package.json
│   ├── .env.example
│   ├── install.bat           # One-touch setup for a brand-new Windows PC (generates its own token)
│   ├── start.bat / stop.bat  # Start/stop the connector as a background process
│   ├── install.ps1           # pm2-based installer, Windows (alternative to start/stop.bat)
│   └── install.sh            # pm2-based installer, Linux/macOS
│
└── README.md
```

## Tools exposed to the MCP client

- **`list_connectors`** — which PCs/connectors are currently online.
- **`run_named_query`** — run a pre-approved query by name (`queryName` +
  `params`) from that connector's `queries.js` allowlist. Never accepts raw
  SQL.
- **`run_sql_query`** — run an ad-hoc SQL `SELECT` the client writes itself
  (e.g. "list tables via `INFORMATION_SCHEMA.TABLES`, then query them").
  Enforced read-only by the agent regardless of what's sent; INSERT/UPDATE/
  DELETE/DROP/EXEC/etc. are rejected before touching the database.

## Key rules to keep

- The agent decides what it's willing to run, independent of what the
  server/client asked for — defense in depth even if Render were compromised.
- Every connector has its own unique ID + strong random token; every client
  request needs `MCP_ACCESS_TOKEN`.
- Outbound-only from every local machine, always — no inbound ports, no port
  forwarding, no static IP requirement.
- Use a **least-privilege DB login** for the connector, not an admin account
  (`sa`, `SYSTEM`, etc.) — the read-only guard is software-level defense, not
  a substitute for real database permissions.

## Hosting on Render

1. Push this repo to GitHub.
2. Render → New → Blueprint (uses `render-mcp-server/render.yaml`), or
   manually: New Web Service, root directory `render-mcp-server`, build
   command `npm install`, start command `npm start`.
3. Set env vars in the Render dashboard:
   - `CONNECTOR_TOKENS` = `id1:token1,id2:token2,...` (one pair per connector)
   - `MCP_ACCESS_TOKEN` = a single strong random secret (required for any
     real deployment — without it the endpoint is unauthenticated)
4. Deploy. Endpoints become:
   - MCP: `https://<your-app>.onrender.com/mcp?key=<MCP_ACCESS_TOKEN>`
   - Agent relay: `wss://<your-app>.onrender.com/agent`
   - Health check: `https://<your-app>.onrender.com/healthz` (not gated —
     reveals only which connector IDs are online, no data)

## Setting up a local connector (new PC)

The simplest path: copy the `local-agent/` folder to the target PC (zip it,
USB drive, whatever) and double-click **`install.bat`**. It will:

1. Check Node.js is installed.
2. Ask for a `Connector ID` (unique name for that PC) and the DB connection
   details.
3. **Generate a secure `CONNECTOR_TOKEN` itself** — no need to invent one.
4. Write `.env` and run `npm install`.
5. Print (and save to `ADD_TO_RENDER.txt`) the `id:token` line to append to
   Render's `CONNECTOR_TOKENS`.
6. Ask how it should run — **press Enter to accept the recommended default**:
   - **Option 1 — background process**: simple, but someone has to
     double-click `start.bat` again after every reboot/logoff.
   - **Option 2 — Windows auto-start service (default)**: installs
     [`pm2`](https://pm2.keymetrics.io/) + `pm2-windows-startup` and
     registers the connector to relaunch automatically on every boot, with
     no one needing to log in. If the boot-registration step needs admin
     rights, it tells you to re-run `install.bat` as Administrator.

Managing an auto-start (option 2) connector — all in `local-agent/`:
- **Status + recent logs**: `service-status.bat` (or `pm2 status` / `pm2 logs sql-connector`)
- **Stop** (until next reboot): `service-stop.bat`
- **Restart**: `service-restart.bat`
- **Remove auto-start entirely**: `service-uninstall.bat`

Managing a background-process (option 1) connector:
- **Start**: double-click `start.bat` (refuses to double-start if already
  running).
- **Stop**: double-click `stop.bat`.
- **Logs**: `agent.log` / `agent.err.log` in the same folder.

(`install.ps1`/`install.sh` are an older, `pm2`-based alternative for
Linux/macOS — `install.bat`'s option 2 now covers the Windows case with
boot-time auto-start included.)

### Adding real named queries

Edit `queries.js` on that PC — see the placeholder-syntax comment at the top
(mysql/sqlite use `?`, postgres uses `$1,$2...`, mssql/hana use `@p0,@p1...`
or positional depending on driver). This only matters for `run_named_query`;
`run_sql_query` doesn't need any predefined queries.

## Adding a new connector later

Run `install.bat` on the new machine, add the printed `id:token` to Render's
`CONNECTOR_TOKENS`, save. Render redeploys automatically. No code changes
needed on either side.

## Connecting an MCP client

- **ChatGPT**: Settings → Connectors → enable Developer Mode → Add custom
  connector → URL = `https://<your-app>.onrender.com/mcp?key=<MCP_ACCESS_TOKEN>`.
- **Claude**: claude.ai/Claude Desktop → Settings → Connectors → Add custom
  connector → same URL.
- Any other MCP client that supports a custom `Authorization: Bearer` header
  can use the bare `/mcp` URL with that header instead of the `?key=` query
  param — functionally identical, just avoids the token sitting in a URL.

Once connected, ask the client to `list_connectors` to confirm which PCs are
online, then either `run_named_query` (by name) or `run_sql_query` (ad-hoc
SELECT) against a specific `connectorId`.

## Known gaps / things to harden further

- No per-query audit log yet — can't currently tell who ran what after the
  fact. Worth adding if this is used by more than one trusted person.
- No rate limiting on Render's side.
- `run_sql_query`'s guard is a keyword blocklist, not a full SQL parser —
  reasonable defense in depth, but the real backstop against damage is the
  DB login's own permissions, which should be read-only/least-privilege.
