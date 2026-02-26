import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchEmployees,
  getProjectsByStatus,
  getProjectMembers,
  getUserDepartment,
  generateEmbedding,
  pool,
} from "./db.js";

export function registerTools(server: McpServer) {
  // Tool 1: Search the employee directory
  server.tool(
    "search_employees",
    `Search the internal employee directory by name, email, or role.
     Returns matching employees with their department and reporting structure.
     Use this when the user asks about people, teams, or org structure.`,
    {
      query: z
        .string()
        .describe("Search term: employee name, email, or role title"),
      department: z
        .string()
        .optional()
        .describe(
          "Filter by department name (e.g., 'Engineering', 'Marketing')"
        ),
    },
    async ({ query, department }) => {
      const employees = await searchEmployees(query, department);

      if (employees.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No employees found matching "${query}"${department ? ` in ${department}` : ""}.`,
            },
          ],
        };
      }

      const formatted = employees
        .map(
          (e) =>
            `- **${e.name}** (${e.email})\n  Role: ${e.role} | Dept: ${e.department} | Since: ${e.start_date}`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${employees.length} employee(s):\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Tool 2: List projects by status
  server.tool(
    "list_projects",
    `List internal projects filtered by status.
     Returns project name, lead, department, and deadline.
     Use this when the user asks about ongoing work, project status, or deadlines.`,
    {
      status: z
        .enum(["active", "completed", "on_hold"])
        .describe("Project status to filter by"),
    },
    async ({ status }) => {
      const projects = await getProjectsByStatus(status);

      if (projects.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No ${status} projects found.`,
            },
          ],
        };
      }

      const formatted = projects
        .map(
          (p) =>
            `- **${p.name}** [${p.status}]\n  Lead: ${p.lead_id} | Dept: ${p.department} | Deadline: ${p.deadline ?? "None"}`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `${projects.length} ${status} project(s):\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Tool 3: Get team members for a project
  server.tool(
    "get_project_team",
    `Get all team members assigned to a specific project.
     Returns employee details for each member.
     Use this when the user asks who is working on a project.`,
    {
      project_id: z
        .string()
        .uuid()
        .describe("The UUID of the project to look up"),
    },
    async ({ project_id }) => {
      const members = await getProjectMembers(project_id);

      if (members.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No team members found for this project.",
            },
          ],
        };
      }

      const formatted = members
        .map((m) => `- ${m.name} (${m.role}, ${m.department})`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Project team (${members.length} members):\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Tool 4: Get ticket details from internal ticketing system
  server.tool(
    "get_ticket_details",
    `Look up a support ticket from the internal ticketing system.
     Returns ticket status, assignee, priority, and recent updates.`,
    {
      ticket_id: z
        .string()
        .regex(/^TK-\d+$/)
        .describe("Ticket ID in format TK-12345"),
    },
    async ({ ticket_id }) => {
      const response = await fetch(
        `${process.env.TICKETING_API_URL}/api/v2/tickets/${ticket_id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.TICKETING_SERVICE_TOKEN}`,
          },
        }
      );

      if (response.status === 404) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket ${ticket_id} not found.`,
            },
          ],
        };
      }

      if (response.status === 403) {
        return {
          content: [
            {
              type: "text" as const,
              text: `You don't have access to ticket ${ticket_id}.`,
            },
          ],
        };
      }

      const ticket = (await response.json()) as {
        id: string;
        title: string;
        status: string;
        priority: string;
        assignee?: { name: string };
        created_at: string;
        updates?: { body: string }[];
      };

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `**${ticket.id}: ${ticket.title}**`,
              `Status: ${ticket.status} | Priority: ${ticket.priority}`,
              `Assignee: ${ticket.assignee?.name ?? "Unassigned"}`,
              `Created: ${ticket.created_at}`,
              "",
              `**Latest Update:**`,
              ticket.updates?.[0]?.body ?? "No updates yet.",
            ].join("\n"),
          },
        ],
      };
    }
  );

  // Tool 5: Search internal knowledge base (RAG)
  server.tool(
    "search_internal_docs",
    `Search the internal knowledge base for relevant documents.
     Covers engineering docs, runbooks, architecture decisions, and policies.
     Use this when the user asks about internal processes, systems, or decisions.`,
    {
      query: z.string().describe("Natural language search query"),
      category: z
        .enum(["engineering", "policy", "runbook", "architecture", "all"])
        .default("all")
        .describe("Document category to search within"),
      limit: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe("Maximum number of results"),
    },
    async ({ query, category, limit }) => {
      const embedding = await generateEmbedding(query);

      const results = await pool.query<{
        id: string;
        title: string;
        category: string;
        content_chunk: string;
        source_url: string;
        updated_at: string;
        similarity: number;
      }>(
        `SELECT
           d.id,
           d.title,
           d.category,
           d.content_chunk,
           d.source_url,
           d.updated_at,
           1 - (d.embedding <=> $1::vector) AS similarity
         FROM document_chunks d
         WHERE ($2 = 'all' OR d.category = $2)
           AND 1 - (d.embedding <=> $1::vector) > 0.7
         ORDER BY d.embedding <=> $1::vector
         LIMIT $3`,
        [JSON.stringify(embedding), category, limit]
      );

      if (results.rows.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No relevant documents found for "${query}".`,
            },
          ],
        };
      }

      const formatted = results.rows
        .map(
          (doc, i) =>
            `### ${i + 1}. ${doc.title}\n` +
            `Category: ${doc.category} | Updated: ${doc.updated_at} | Relevance: ${(doc.similarity * 100).toFixed(0)}%\n\n` +
            `${doc.content_chunk}\n\n` +
            `Source: ${doc.source_url}`
        )
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.rows.length} relevant document(s):\n\n${formatted}`,
          },
        ],
      };
    }
  );
}
