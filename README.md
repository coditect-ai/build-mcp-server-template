# Internal Data MCP Server

An MCP (Model Context Protocol) server that exposes internal organizational data — employee directory, project management, ticketing, and knowledge base — to AI assistants.

**Companion blog post:** [How to Build MCP Servers for Your Internal Data](https://freecodecamp.org) (freeCodeCamp)

## Features

- **Employee directory search** — find people by name, email, or role
- **Project management** — list projects by status, view team members
- **Ticket lookup** — query your internal ticketing system
- **Knowledge base RAG** — vector search across internal documents
- **Authentication** — Bearer token middleware with pluggable validation
- **Resource endpoints** — org structure overview, department details

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 15+ with [pgvector](https://github.com/pgvector/pgvector) extension
- An OpenAI API key (for document embeddings)

### Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# Create database tables
psql $INTERNAL_DB_URL < schema.sql

# Start the server
npm run dev
```

The server runs at `http://localhost:3100/mcp`.

### Connect with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "internal-data": {
      "url": "http://localhost:3100/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

### Stdio Mode (local)

```bash
npm run dev:stdio
```

## Project Structure

```
src/
├── index.ts           # HTTP server with StreamableHTTP transport
├── stdio.ts           # Stdio transport (for local clients)
├── tools.ts           # MCP tool definitions
├── resources.ts       # MCP resource definitions
├── db.ts              # Database access layer
├── auth-middleware.ts  # Express auth middleware
└── client-example.ts  # Example client usage
```

## Docker

```bash
docker build -t internal-data-mcp .
docker run -p 3100:3100 --env-file .env internal-data-mcp
```

## License

MIT
