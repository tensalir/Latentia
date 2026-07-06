-- Async MCP generation jobs for get_generation_status polling

CREATE TABLE IF NOT EXISTS headless_mcp_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES headless_credentials(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL,
  request JSONB NOT NULL,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS headless_mcp_jobs_credential_created_idx
  ON headless_mcp_jobs (credential_id, created_at DESC);

CREATE INDEX IF NOT EXISTS headless_mcp_jobs_status_idx
  ON headless_mcp_jobs (status);

ALTER TABLE headless_mcp_jobs ENABLE ROW LEVEL SECURITY;
