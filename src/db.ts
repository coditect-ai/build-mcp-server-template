import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.INTERNAL_DB_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export { pool };

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  manager_id: string | null;
  start_date: string;
}

export interface Project {
  id: string;
  name: string;
  status: "active" | "completed" | "on_hold";
  lead_id: string;
  department: string;
  deadline: string | null;
}

export async function searchEmployees(
  query: string,
  department?: string
): Promise<Employee[]> {
  const conditions = ["(name ILIKE $1 OR email ILIKE $1 OR role ILIKE $1)"];
  const params: string[] = [`%${query}%`];

  if (department) {
    conditions.push(`department = $${params.length + 1}`);
    params.push(department);
  }

  const result = await pool.query<Employee>(
    `SELECT id, name, email, department, role, manager_id, start_date
     FROM employees
     WHERE ${conditions.join(" AND ")}
     ORDER BY name
     LIMIT 25`,
    params
  );

  return result.rows;
}

export async function getProjectsByStatus(
  status: string
): Promise<Project[]> {
  const result = await pool.query<Project>(
    `SELECT id, name, status, lead_id, department, deadline
     FROM projects
     WHERE status = $1
     ORDER BY deadline ASC NULLS LAST`,
    [status]
  );

  return result.rows;
}

export async function getProjectMembers(
  projectId: string
): Promise<Employee[]> {
  const result = await pool.query<Employee>(
    `SELECT e.id, e.name, e.email, e.department, e.role,
            e.manager_id, e.start_date
     FROM employees e
     JOIN project_members pm ON pm.employee_id = e.id
     WHERE pm.project_id = $1
     ORDER BY e.name`,
    [projectId]
  );

  return result.rows;
}

export async function getUserDepartment(
  userId: string
): Promise<string | undefined> {
  const result = await pool.query<{ department: string }>(
    `SELECT department FROM employees WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.department;
}

export async function generateOrgOverview(): Promise<string> {
  const result = await pool.query<{
    department: string;
    count: string;
    lead: string;
  }>(
    `SELECT
       e.department,
       COUNT(*)::text AS count,
       COALESCE(
         (SELECT name FROM employees WHERE id = (
           SELECT manager_id FROM employees
           WHERE department = e.department
           LIMIT 1
         )),
         'TBD'
       ) AS lead
     FROM employees e
     GROUP BY e.department
     ORDER BY e.department`
  );

  const lines = result.rows.map(
    (r) => `- **${r.department}**: ${r.count} people (Lead: ${r.lead})`
  );

  return `# Organization Overview\n\n${lines.join("\n")}`;
}

export async function getDepartmentDetails(
  name: string
): Promise<string> {
  const result = await pool.query<Employee>(
    `SELECT id, name, email, role, start_date
     FROM employees
     WHERE department = $1
     ORDER BY start_date ASC`,
    [name]
  );

  if (result.rows.length === 0) {
    return `# ${name}\n\nNo employees found in this department.`;
  }

  const members = result.rows
    .map((e) => `| ${e.name} | ${e.role} | ${e.email} | ${e.start_date} |`)
    .join("\n");

  return [
    `# ${name} Department`,
    "",
    `**Team size:** ${result.rows.length}`,
    "",
    "| Name | Role | Email | Start Date |",
    "|------|------|-------|------------|",
    members,
  ].join("\n");
}

export async function generateEmbedding(
  text: string
): Promise<number[]> {
  // Replace with your actual embedding generation.
  // Example using OpenAI:
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0].embedding;
}
