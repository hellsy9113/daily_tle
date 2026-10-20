-- Website identities are independent of the optional Telegram delivery service.
ALTER TABLE tracking.accounts ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE tracking.accounts ADD COLUMN google_id text UNIQUE;
ALTER TABLE tracking.accounts ADD COLUMN google_email text;
ALTER TABLE tracking.accounts ADD COLUMN daily_grind_registration_id uuid;
ALTER TABLE tracking.accounts ADD COLUMN daily_grind_registered_at timestamptz;
ALTER TABLE tracking.accounts ADD COLUMN daily_grind_agreement_version text;
ALTER TABLE tracking.accounts ADD COLUMN daily_grind_paused boolean NOT NULL DEFAULT false;
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_login_identity_check CHECK (telegram_id IS NOT NULL OR google_id IS NOT NULL);
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_daily_grind_registration_check CHECK (
  (daily_grind_registration_id IS NULL) = (daily_grind_registered_at IS NULL)
);
-- Retain explicit existing bot connections; new accounts have no bot registration.
UPDATE tracking.accounts SET daily_grind_registration_id = gen_random_uuid(),
  daily_grind_registered_at = connected_at WHERE chat_id IS NOT NULL;
CREATE OR REPLACE FUNCTION tracking.protect_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.telegram_id IS NOT NULL AND NEW.telegram_id IS DISTINCT FROM OLD.telegram_id)
     OR (OLD.google_id IS NOT NULL AND NEW.google_id IS DISTINCT FROM OLD.google_id)
     OR (OLD.chat_id IS NOT NULL AND NEW.chat_id IS DISTINCT FROM OLD.chat_id
         AND NOT (NEW.chat_id IS NULL AND NEW.daily_grind_registration_id IS NULL)) THEN
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


CREATE TABLE tracking.google_login_attempts (
  token_hash text PRIMARY KEY,
  state text NOT NULL,
  nonce text NOT NULL,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  link_account_id uuid REFERENCES tracking.accounts(id),
  session_hash text,
  CHECK ((link_account_id IS NULL) = (session_hash IS NULL))
);
CREATE INDEX google_login_attempts_expiry ON tracking.google_login_attempts(expires_at);

ALTER TABLE tracking.connection_tokens ADD COLUMN registration_id uuid;
DELETE FROM tracking.connection_tokens t USING tracking.accounts a WHERE t.account_id = a.id AND a.daily_grind_registration_id IS NULL;
UPDATE tracking.connection_tokens t SET registration_id = a.daily_grind_registration_id FROM tracking.accounts a WHERE t.account_id = a.id;
ALTER TABLE tracking.connection_tokens ALTER COLUMN registration_id SET NOT NULL;
