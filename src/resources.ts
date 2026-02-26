import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateOrgOverview, getDepartmentDetails } from "./db.js";

export function registerResources(server: McpServer) {
  // Static resource: org chart overview
  server.resource(
    "org-structure",
    "internal://org-structure",
    {
      description:
        "Overview of the organization structure including departments and leadership",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await generateOrgOverview(),
        },
      ],
    })
  );

  // Dynamic resource template: department details
  server.resource(
    "department-info",
    new ResourceTemplate("internal://departments/{name}", {
      list: undefined,
    }),
    {
      description: "Detailed information about a specific department",
      mimeType: "text/markdown",
    },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await getDepartmentDetails(variables.name as string),
        },
      ],
    })
  );
}
