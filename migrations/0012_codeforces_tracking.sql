ALTER TABLE tracking.accounts ADD COLUMN codeforces_username text;
ALTER TABLE tracking.accounts ADD COLUMN codeforces_username_key text GENERATED ALWAYS AS (lower(codeforces_username)) STORED;
ALTER TABLE tracking.accounts ADD COLUMN codeforces_registered_at timestamptz;
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_codeforces_username_key_unique UNIQUE (codeforces_username_key);
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_codeforces_username_check CHECK (
  codeforces_username IS NULL OR (length(codeforces_username) BETWEEN 1 AND 100 AND codeforces_username !~ '\s')
);

CREATE OR REPLACE FUNCTION tracking.protect_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id
     OR (OLD.chat_id IS NOT NULL AND NEW.chat_id IS DISTINCT FROM OLD.chat_id) THEN
    RAISE EXCEPTION 'Registered identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF (OLD.leetcode_username IS NOT NULL AND
      (NEW.leetcode_username IS DISTINCT FROM OLD.leetcode_username OR NEW.registered_at IS DISTINCT FROM OLD.registered_at)
      AND NOT (NEW.leetcode_username IS NULL AND NEW.registered_at IS NULL))
     OR (OLD.gfg_username IS NOT NULL AND
      (NEW.gfg_username IS DISTINCT FROM OLD.gfg_username OR NEW.gfg_registered_at IS DISTINCT FROM OLD.gfg_registered_at)
      AND NOT (NEW.gfg_username IS NULL AND NEW.gfg_registered_at IS NULL))
     OR (OLD.hackerrank_username IS NOT NULL AND
      (NEW.hackerrank_username IS DISTINCT FROM OLD.hackerrank_username OR NEW.hackerrank_registered_at IS DISTINCT FROM OLD.hackerrank_registered_at)
      AND NOT (NEW.hackerrank_username IS NULL AND NEW.hackerrank_registered_at IS NULL))
     OR (OLD.codeforces_username IS NOT NULL AND
      (NEW.codeforces_username IS DISTINCT FROM OLD.codeforces_username OR NEW.codeforces_registered_at IS DISTINCT FROM OLD.codeforces_registered_at)
      AND NOT (NEW.codeforces_username IS NULL AND NEW.codeforces_registered_at IS NULL)) THEN
    RAISE EXCEPTION 'Revoke the service before changing its username' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE tracking.platform_services DROP CONSTRAINT platform_services_platform_check;
ALTER TABLE tracking.platform_services ADD CONSTRAINT platform_services_platform_check CHECK (platform IN ('leetcode', 'gfg', 'hackerrank', 'codeforces'));
ALTER TABLE tracking.daily_collections DROP CONSTRAINT daily_collections_platform_check;
ALTER TABLE tracking.daily_collections ADD CONSTRAINT daily_collections_platform_check CHECK (platform IN ('leetcode', 'gfg', 'hackerrank', 'codeforces'));
ALTER TABLE tracking.deliveries DROP CONSTRAINT deliveries_platform_check;
ALTER TABLE tracking.deliveries ADD CONSTRAINT deliveries_platform_check CHECK (platform IN ('leetcode', 'gfg', 'hackerrank', 'codeforces'));
ALTER TABLE tracking.activity_goals DROP CONSTRAINT activity_goals_platform_check;
ALTER TABLE tracking.activity_goals ADD CONSTRAINT activity_goals_platform_check CHECK (platform IN ('leetcode', 'gfg', 'hackerrank', 'codeforces'));

-- Keep all service generations in step with their canonical account reservations.
CREATE OR REPLACE FUNCTION tracking.sync_platform_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE service text; username text;
BEGIN
  FOR service, username IN SELECT * FROM (VALUES
    ('leetcode', NEW.leetcode_username), ('gfg', NEW.gfg_username),
    ('hackerrank', NEW.hackerrank_username), ('codeforces', NEW.codeforces_username)
  ) AS registrations(platform, handle) LOOP
    IF username IS NOT NULL THEN
      INSERT INTO tracking.platform_services (account_id, platform) VALUES (NEW.id, service)
      ON CONFLICT (account_id, platform) DO NOTHING;
    ELSE
      DELETE FROM tracking.platform_services WHERE account_id = NEW.id AND platform = service;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER accounts_platform_registration ON tracking.accounts;
CREATE TRIGGER accounts_platform_registration AFTER INSERT OR UPDATE OF leetcode_username, gfg_username, hackerrank_username, codeforces_username
ON tracking.accounts FOR EACH ROW EXECUTE FUNCTION tracking.sync_platform_registration();

CREATE TABLE tracking.codeforces_problems (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  submission_id bigint NOT NULL CHECK (submission_id > 0),
  problem_id text NOT NULL,
  contest_id integer NOT NULL CHECK (contest_id > 0),
  problem_index text NOT NULL,
  title text NOT NULL,
  solved_at timestamptz NOT NULL,
  first_observed_at timestamptz NOT NULL,
  baseline boolean NOT NULL,
  rating integer,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
  PRIMARY KEY (account_id, submission_id)
);
CREATE INDEX codeforces_problems_account_solved ON tracking.codeforces_problems (account_id, solved_at);
CREATE TABLE tracking.codeforces_sync (
  account_id uuid PRIMARY KEY REFERENCES tracking.accounts(id),
  profile jsonb,
  refreshed_at timestamptz,
  lease_token text,
  lease_until timestamptz,
  last_error integer
);
CREATE TABLE tracking.codeforces_snapshots (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  snapshot_date date NOT NULL,
  available_solved integer NOT NULL CHECK (available_solved >= 0),
  history_complete boolean NOT NULL,
  history_start timestamptz,
  checked_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, snapshot_date)
);

-- This shared pacing state is not learner data and survives service revocation.
CREATE TABLE tracking.codeforces_api_rate (
  id integer PRIMARY KEY CHECK (id = 1),
  next_request_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tracking.codeforces_api_rate (id) VALUES (1);
