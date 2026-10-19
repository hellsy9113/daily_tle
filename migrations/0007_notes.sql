CREATE TABLE tracking.notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES tracking.accounts(id) ON DELETE CASCADE,
  code_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tracking.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES tracking.notebooks(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) <= 10000),
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notes_links_check CHECK (jsonb_typeof(links) = 'array' AND jsonb_array_length(links) <= 10)
);
CREATE INDEX notes_notebook_created_idx ON tracking.notes(notebook_id, created_at DESC, id DESC);

CREATE TABLE tracking.notes_sessions (
  token_hash text PRIMARY KEY,
  notebook_id uuid NOT NULL REFERENCES tracking.notebooks(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX notes_sessions_expiry_idx ON tracking.notes_sessions(expires_at);

CREATE TABLE tracking.notes_login_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE INDEX notes_login_limits_reset_idx ON tracking.notes_login_limits(reset_at);
