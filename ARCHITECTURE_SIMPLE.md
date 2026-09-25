# SQL Gateway MCP — Architecture in Plain Language

A simple explanation of how this connector lets ChatGPT/Claude query your
local SQL Server database **without opening any port or exposing your PC's
IP address**. For the full technical reference, see
[README.md](README.md).

## The problem it solves

Your database sits on a local PC. Normally, if an AI on the internet needs
to query it, you'd have to open a port on your router/firewall and expose
your PC's IP — a real security risk, since anyone could try to hit that open
port.

## The trick: "call out, don't let anyone call in"

Instead of opening a door **into** your PC, your PC opens a door **out** to
a server on the internet (Render) and keeps holding it open — like calling a
call center and staying on hold. The call center never had to dial your
number.

This is the same idea Power BI uses for its "on-premises data gateway."

## The three pieces

1. **Render server** (`sql-gateway-mcp-server`, always online on the internet)
   - This is the only thing ChatGPT/Claude ever talks to.
   - It never sees your database or your data — it's just a switchboard.

2. **Local agent** (small program running on your PC)
   - Dials **out** to Render and stays connected — like an employee calling
     a helpdesk and staying on the line waiting for tickets.
   - Knows your real database credentials; Render never sees them.
   - If the connection drops, it calls back and reconnects automatically.

3. **Your database** (SQL Server, on this PC)
   - Only the local agent talks to it directly, and only with a
     **read-only** login.

## What happens when someone asks a question

1. Someone (via ChatGPT/Claude) asks a question, e.g. "show me last month's
   sales."
2. The request goes to Render.
3. Render doesn't run it — it passes the request down the already-open line
   to your local agent.
4. Your local agent checks: "is this just a SELECT, nothing dangerous?" If
   yes, it runs it against the real database.
5. The answer travels back up the same line, through Render, to whoever
   asked.

## Why it's safe

- **No open door on your PC** — nothing can be "hacked into" from outside
  because there's no listening port to attack.
- **Two locks, not one**: a secret key to talk to Render
  (`MCP_ACCESS_TOKEN`), and a separate secret per-PC token to talk to your
  agent (`CONNECTOR_TOKEN`).
- **The agent double-checks everything itself** — even if Render were ever
  compromised, your local agent still refuses to run anything except safe
  read queries, because it enforces that rule locally, not because it trusts
  Render to ask nicely.
- **Least-privilege DB login** — the agent's database account can only
  read, so even a bug can't delete or change data.

## This machine's setup

- Live connector: `sap-live`, pointed at local SQL Server database
  `NOCPL_LIVe` (`DESKTOP-ICFN0OJ\SQLEXPRESS01`).
- Planned but not yet configured: `WMS_DEV_UK` (SAP HANA) — driver support
  already exists in `local-agent/db.js`, just needs real
  `HANA_HOST`/`PORT`/`USER`/`PASSWORD`.
