CREATE SCHEMA IF NOT EXISTS tracking;

CREATE TABLE tracking.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE CHECK (telegram_id > 0),
  leetcode_username text,
  username_key text GENERATED ALWAYS AS (lower(leetcode_username)) STORED,
  chat_id bigint UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'blocked')),
  registered_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_username_key_unique UNIQUE (username_key),
  CHECK (leetcode_username IS NULL OR (length(leetcode_username) BETWEEN 1 AND 100 AND leetcode_username !~ '\s')),
  CHECK (status = 'pending' OR (leetcode_username IS NOT NULL AND chat_id IS NOT NULL AND connected_at IS NOT NULL)),
  CHECK (chat_id IS NULL OR chat_id = telegram_id)
);

CREATE FUNCTION tracking.protect_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id
     OR (OLD.leetcode_username IS NOT NULL AND NEW.leetcode_username IS DISTINCT FROM OLD.leetcode_username)
     OR (OLD.chat_id IS NOT NULL AND NEW.chat_id IS DISTINCT FROM OLD.chat_id)
     OR (OLD.registered_at IS NOT NULL AND NEW.registered_at IS DISTINCT FROM OLD.registered_at) THEN
    RAISE EXCEPTION 'Registered identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accounts_immutable_identity BEFORE UPDATE ON tracking.accounts
FOR EACH ROW EXECUTE FUNCTION tracking.protect_account_identity();

CREATE TABLE tracking.sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON tracking.sessions(expires_at);
CREATE TABLE tracking.login_attempts (
  token_hash text PRIMARY KEY,
  state text NOT NULL,
  nonce text NOT NULL,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE tracking.connection_tokens (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES tracking.accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE tracking.telegram_updates (
  update_id bigint PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tracking.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  report_date date NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  messages jsonb,
  sent_parts integer NOT NULL DEFAULT 0 CHECK (sent_parts >= 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_account_date_unique UNIQUE (account_id, report_date),
  CHECK (period_start < period_end),
  CHECK (messages IS NULL OR jsonb_typeof(messages) = 'array')
);
CREATE INDEX deliveries_dispatch ON tracking.deliveries(report_date, next_attempt_at);
CREATE TABLE tracking.dispatch_lock (
  id integer PRIMARY KEY CHECK (id = 1),
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
