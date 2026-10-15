ALTER TABLE tracking.accounts ADD COLUMN hackerrank_username text;
ALTER TABLE tracking.accounts ADD COLUMN hackerrank_username_key text GENERATED ALWAYS AS (lower(hackerrank_username)) STORED;
ALTER TABLE tracking.accounts ADD COLUMN hackerrank_registered_at timestamptz;
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_hackerrank_username_key_unique UNIQUE (hackerrank_username_key);
ALTER TABLE tracking.accounts ADD CHECK (hackerrank_username IS NULL OR (length(hackerrank_username) BETWEEN 1 AND 100 AND hackerrank_username !~ '\s'));
ALTER TABLE tracking.accounts DROP CONSTRAINT accounts_registration_check;
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_registration_check CHECK (
  status = 'pending' OR ((leetcode_username IS NOT NULL OR gfg_username IS NOT NULL OR hackerrank_username IS NOT NULL)
    AND chat_id IS NOT NULL AND connected_at IS NOT NULL)
);
CREATE OR REPLACE FUNCTION tracking.protect_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id
     OR (OLD.leetcode_username IS NOT NULL AND NEW.leetcode_username IS DISTINCT FROM OLD.leetcode_username)
     OR (OLD.gfg_username IS NOT NULL AND NEW.gfg_username IS DISTINCT FROM OLD.gfg_username)
     OR (OLD.hackerrank_username IS NOT NULL AND NEW.hackerrank_username IS DISTINCT FROM OLD.hackerrank_username)
     OR (OLD.chat_id IS NOT NULL AND NEW.chat_id IS DISTINCT FROM OLD.chat_id)
     OR (OLD.registered_at IS NOT NULL AND NEW.registered_at IS DISTINCT FROM OLD.registered_at)
     OR (OLD.gfg_registered_at IS NOT NULL AND NEW.gfg_registered_at IS DISTINCT FROM OLD.gfg_registered_at)
     OR (OLD.hackerrank_registered_at IS NOT NULL AND NEW.hackerrank_registered_at IS DISTINCT FROM OLD.hackerrank_registered_at) THEN
    RAISE EXCEPTION 'Registered identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE tracking.deliveries DROP CONSTRAINT deliveries_platform_check;
ALTER TABLE tracking.deliveries ADD CONSTRAINT deliveries_platform_check CHECK (platform IN ('leetcode', 'gfg', 'hackerrank'));
ALTER TABLE tracking.activity_goals DROP CONSTRAINT activity_goals_platform_check;
ALTER TABLE tracking.activity_goals ADD CONSTRAINT activity_goals_platform_check CHECK (platform IN ('leetcode', 'gfg', 'hackerrank'));
CREATE TABLE tracking.hackerrank_problems (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  problem_id text NOT NULL, title text NOT NULL, slug text NOT NULL, contest text NOT NULL,
  solved_at timestamptz NOT NULL, first_observed_at timestamptz NOT NULL, baseline boolean NOT NULL,
  PRIMARY KEY (account_id, problem_id)
);
CREATE TABLE tracking.hackerrank_sync (
  account_id uuid PRIMARY KEY REFERENCES tracking.accounts(id),
  profile jsonb, refreshed_at timestamptz, lease_token text, lease_until timestamptz, last_error integer
);
CREATE TABLE tracking.hackerrank_snapshots (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id), snapshot_date date NOT NULL,
  available_solved integer NOT NULL CHECK (available_solved >= 0), history_complete boolean NOT NULL, checked_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, snapshot_date)
);
