import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createAgentRelay } from './agentRelay.js';

const relay = createAgentRelay();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/healthz', (req, res) => {
  res.json({ ok: true, connectors: relay.listConnectors() });
});

function createMcpServer() {
  const server = new McpServer({ name: 'sql-gateway-mcp', version: '1.0.0' });

  server.tool(
    'list_connectors',
    'List which local database connectors are currently online and reachable.',
    {},
    async () => {
      const connectors = relay.listConnectors();
      return {
        content: [
          {
            type: 'text',
            text: connectors.length
              ? `Online connectors: ${connectors.join(', ')}`
              : 'No connectors are currently online.'
          }
        ]
      };
    }
  );

  server.tool(
    'run_named_query',
    'Run a pre-approved, named, parameterized query against a specific connector\'s local database. This never accepts raw SQL - only a queryName that must already be allowlisted on that connector, plus named params.',
    {
      connectorId: z
        .string()
        .describe('Which connector/PC to run the query on, e.g. "office-pc". Use list_connectors to see available IDs.'),
      queryName: z.string().describe('The name of an allowlisted query defined on that connector.'),
      params: z.record(z.any()).optional().describe('Named parameters required by that query.')
    },
    async ({ connectorId, queryName, params }) => {
      try {
        const result = await relay.sendJob(connectorId, { queryName, params: params || {} });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    'run_sql_query',
    'Run an ad-hoc, read-only SQL SELECT query against a specific connector\'s local database. Write the SQL yourself based on the schema you know or discover. The connector enforces read-only (SELECT-only) at the agent side regardless of what is sent - INSERT/UPDATE/DELETE/DDL will be rejected.',
    {
      connectorId: z
        .string()
        .describe('Which connector/PC to run the query on, e.g. "office-pc". Use list_connectors to see available IDs.'),
      sql: z.string().describe('A single read-only SQL SELECT statement to run.')
    },
    async ({ connectorId, sql }) => {
      try {
        const result = await relay.sendJob(connectorId, { sql });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  return server;
}

// One MCP session per Streamable HTTP session ID, per the SDK's documented pattern.
const transports = {};

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      }
    });

    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };

    const server = createMcpServer();
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

async function handleSessionRequest(req, res) {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
}

app.get('/mcp', handleSessionRequest);
app.delete('/mcp', handleSessionRequest);

const PORT = process.env.PORT || 3000;
const httpServer = http.createServer(app);
relay.attach(httpServer);

httpServer.listen(PORT, () => {
  console.log(`SQL Gateway MCP server listening on port ${PORT}`);
  console.log('MCP endpoint:   /mcp');
  console.log('Agent relay:    /agent');
  console.log('Health check:   /healthz');
});
