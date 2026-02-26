import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { authMiddleware } from "./auth-middleware.js";
import { pool } from "./db.js";

const app = express();
app.use(express.json());

const server = new McpServer(
  { name: "internal-data", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

registerTools(server);
registerResources(server);

// Store transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

// Apply auth middleware to MCP endpoint
app.use("/mcp", authMiddleware);

// Handle all MCP requests on a single endpoint
app.all("/mcp", async (req, res) => {
  // Check for existing session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Existing session — route to its transport
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }

  if (sessionId && !transports.has(sessionId)) {
    // Unknown session ID
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // New session — create transport and connect
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
    }
  };

  await server.connect(transport);
  await transport.handleRequest(req, res);
});

// Health check endpoint
app.get("/health", async (_req, res) => {
  const checks = {
    database: false,
    ticketingApi: false,
  };

  try {
    await pool.query("SELECT 1");
    checks.database = true;
  } catch {
    // database unreachable
  }

  try {
    if (process.env.TICKETING_API_URL) {
      const resp = await fetch(
        `${process.env.TICKETING_API_URL}/health`
      );
      checks.ticketingApi = resp.ok;
    } else {
      checks.ticketingApi = true; // skip if not configured
    }
  } catch {
    // ticketing API unreachable
  }

  const healthy = Object.values(checks).every(Boolean);
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    checks,
    uptime: process.uptime(),
  });
});

const PORT = parseInt(process.env.PORT ?? "3100", 10);

app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
