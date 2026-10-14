ALTER TABLE tracking.accounts ADD COLUMN gfg_username text;
ALTER TABLE tracking.accounts ADD COLUMN gfg_username_key text GENERATED ALWAYS AS (lower(gfg_username)) STORED;
ALTER TABLE tracking.accounts ADD COLUMN gfg_registered_at timestamptz;
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_gfg_username_key_unique UNIQUE (gfg_username_key);
ALTER TABLE tracking.accounts ADD CHECK (gfg_username IS NULL OR (length(gfg_username) BETWEEN 1 AND 100 AND gfg_username !~ '\s'));

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'tracking.accounts'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%leetcode_username IS NOT NULL%'
      AND pg_get_constraintdef(oid) LIKE '%connected_at IS NOT NULL%'
  LOOP EXECUTE format('ALTER TABLE tracking.accounts DROP CONSTRAINT %I', constraint_name); END LOOP;
END;
$$;
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_registration_check CHECK (
  status = 'pending' OR ((leetcode_username IS NOT NULL OR gfg_username IS NOT NULL)
    AND chat_id IS NOT NULL AND connected_at IS NOT NULL)
);

CREATE OR REPLACE FUNCTION tracking.protect_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id
     OR (OLD.leetcode_username IS NOT NULL AND NEW.leetcode_username IS DISTINCT FROM OLD.leetcode_username)
     OR (OLD.gfg_username IS NOT NULL AND NEW.gfg_username IS DISTINCT FROM OLD.gfg_username)
     OR (OLD.chat_id IS NOT NULL AND NEW.chat_id IS DISTINCT FROM OLD.chat_id)
     OR (OLD.registered_at IS NOT NULL AND NEW.registered_at IS DISTINCT FROM OLD.registered_at)
     OR (OLD.gfg_registered_at IS NOT NULL AND NEW.gfg_registered_at IS DISTINCT FROM OLD.gfg_registered_at) THEN
    RAISE EXCEPTION 'Registered identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE tracking.deliveries ADD COLUMN platform text NOT NULL DEFAULT 'leetcode' CHECK (platform IN ('leetcode', 'gfg'));
ALTER TABLE tracking.deliveries DROP CONSTRAINT deliveries_account_date_unique;
ALTER TABLE tracking.deliveries ADD CONSTRAINT deliveries_account_platform_date_unique UNIQUE (account_id, platform, report_date);

CREATE TABLE tracking.gfg_problems (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  problem_id text NOT NULL,
  title text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('School', 'Basic', 'Easy', 'Medium', 'Hard')),
  accepted_at timestamptz,
  reported_submission_time text,
  first_observed_at timestamptz NOT NULL,
  baseline boolean NOT NULL,
  PRIMARY KEY (account_id, problem_id)
);
CREATE TABLE tracking.gfg_sync (
  account_id uuid PRIMARY KEY REFERENCES tracking.accounts(id),
  profile jsonb,
  refreshed_at timestamptz,
  lease_token text,
  lease_until timestamptz,
  last_error integer
);
CREATE TABLE tracking.gfg_snapshots (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  snapshot_date date NOT NULL,
  total_solved integer NOT NULL CHECK (total_solved >= 0),
  difficulty_breakdown jsonb NOT NULL,
  checked_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, snapshot_date)
);
