-- Database schema for the internal-data MCP server
-- Run this against your PostgreSQL database before starting the server.

-- Enable pgvector extension (required for document search / RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  role TEXT NOT NULL,
  manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_manager ON employees(manager_id);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'on_hold')),
  lead_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  department TEXT NOT NULL,
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);

-- Project members (many-to-many)
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, employee_id)
);

-- Document chunks for RAG / vector search
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('engineering', 'policy', 'runbook', 'architecture')),
  content_chunk TEXT NOT NULL,
  source_url TEXT,
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_chunks_category ON document_chunks(category);
CREATE INDEX idx_document_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Sample seed data (optional)
INSERT INTO employees (name, email, department, role, start_date) VALUES
  ('Alice Chen', 'alice@company.com', 'Engineering', 'Engineering Manager', '2021-03-15'),
  ('Bob Martinez', 'bob@company.com', 'Engineering', 'Senior Software Engineer', '2022-01-10'),
  ('Carol Davis', 'carol@company.com', 'Marketing', 'Marketing Director', '2020-06-01'),
  ('Dan Kim', 'dan@company.com', 'Engineering', 'Software Engineer', '2023-09-01'),
  ('Eve Johnson', 'eve@company.com', 'Product', 'Product Manager', '2022-05-20')
ON CONFLICT (email) DO NOTHING;

-- Set Alice as Bob's and Dan's manager
UPDATE employees SET manager_id = (SELECT id FROM employees WHERE email = 'alice@company.com')
WHERE email IN ('bob@company.com', 'dan@company.com');

INSERT INTO projects (name, status, department, deadline, lead_id) VALUES
  ('API Redesign', 'active', 'Engineering', '2026-06-01',
    (SELECT id FROM employees WHERE email = 'alice@company.com')),
  ('Brand Refresh', 'active', 'Marketing', '2026-04-15',
    (SELECT id FROM employees WHERE email = 'carol@company.com')),
  ('Mobile App v2', 'on_hold', 'Engineering', NULL,
    (SELECT id FROM employees WHERE email = 'alice@company.com'))
ON CONFLICT DO NOTHING;
