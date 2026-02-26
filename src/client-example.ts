/**
 * Example: Connecting to this MCP server from a client application.
 *
 * Run with: npx tsx src/client-example.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const userToken = process.env.AUTH_TOKEN ?? "dev-token";

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3100/mcp"),
  {
    requestInit: {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    },
  }
);

const client = new Client({ name: "my-ai-app", version: "1.0.0" });

await client.connect(transport);

// Discover available tools
const { tools } = await client.listTools();
console.log(
  "Available tools:",
  tools.map((t) => t.name)
);

// Call a tool
const result = await client.callTool({
  name: "search_employees",
  arguments: { query: "engineering manager" },
});

console.log("\nSearch results:");
console.log(result.content);

// Clean up
await client.close();
