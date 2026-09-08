-- MCP OAuth 2.1: dynamic client registration + authorization code flow.
--
-- Access tokens are ordinary `headless_credentials` rows, so nothing here
-- stores a token: `mcp_oauth_authorizations` only holds the short-lived
-- authorization code (hashed) and the consent state behind it.

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  client_name TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code']::TEXT[],
  response_types TEXT[] NOT NULL DEFAULT ARRAY['code']::TEXT[],
  scope TEXT,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  client_uri TEXT,
  logo_uri TEXT,
  software_id TEXT,
  software_version TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS mcp_oauth_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  scope TEXT,
  resource TEXT,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  code_hash TEXT UNIQUE,
  approved_at TIMESTAMP(3),
  denied_at TIMESTAMP(3),
  consumed_at TIMESTAMP(3),
  expires_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mcp_oauth_authorizations_user_idx
  ON mcp_oauth_authorizations (user_id);

CREATE INDEX IF NOT EXISTS mcp_oauth_authorizations_expires_idx
  ON mcp_oauth_authorizations (expires_at);

-- Tag credentials minted by the OAuth flow so /headless can show where a
-- token came from, and so reconnecting a client can replace its predecessor.
ALTER TABLE headless_credentials
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT;

CREATE INDEX IF NOT EXISTS headless_credentials_oauth_client_idx
  ON headless_credentials (oauth_client_id);

-- Same posture as the rest of the headless tables: no anon/authenticated
-- policies, so only the service role and the Prisma connection can read them.
ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_authorizations ENABLE ROW LEVEL SECURITY;
