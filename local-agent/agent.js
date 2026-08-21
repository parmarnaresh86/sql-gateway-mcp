import 'dotenv/config';
import WebSocket from 'ws';
import { resolveParams } from './queries.js';
import { runQuery } from './db.js';

const { RENDER_URL, CONNECTOR_ID, CONNECTOR_TOKEN } = process.env;

if (!RENDER_URL || !CONNECTOR_ID || !CONNECTOR_TOKEN) {
  console.error('Missing required env vars: RENDER_URL, CONNECTOR_ID, CONNECTOR_TOKEN. Check your .env file.');
  process.exit(1);
}

const MAX_BACKOFF_MS = 30000;
let backoffMs = 1000;

function connect() {
  const url = `${RENDER_URL}?connectorId=${encodeURIComponent(CONNECTOR_ID)}&token=${encodeURIComponent(CONNECTOR_TOKEN)}`;
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`Connected to ${RENDER_URL} as "${CONNECTOR_ID}".`);
    backoffMs = 1000;
  });

  ws.on('message', async (data) => {
    let job;
    try {
      job = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (job.type !== 'job') return;

    const { requestId, queryName, params } = job;

    try {
      if (queryName === 'ping') {
        ws.send(JSON.stringify({ type: 'job_result', requestId, result: { pong: true, connectorId: CONNECTOR_ID } }));
        return;
      }

      // The agent decides what it's willing to run, independent of what
      // the server asked for - defense in depth even if the server side
      // were ever compromised or misconfigured.
      const { sql, values } = resolveParams(queryName, params || {});
      const rows = await runQuery(sql, values);
      ws.send(JSON.stringify({ type: 'job_result', requestId, result: rows }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'job_result', requestId, error: err.message }));
    }
  });

  ws.on('close', () => {
    console.log(`Disconnected. Reconnecting in ${backoffMs / 1000}s...`);
    setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

connect();
