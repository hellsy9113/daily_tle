ALTER TABLE tracking.accounts ADD COLUMN theme text CHECK (theme IN ('light', 'dark'));
ALTER TABLE tracking.accounts DROP CONSTRAINT accounts_registration_check;
ALTER TABLE tracking.accounts ADD CONSTRAINT accounts_registration_check CHECK (
  status = 'pending' OR (chat_id IS NOT NULL AND connected_at IS NOT NULL)
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
      AND NOT (NEW.hackerrank_username IS NULL AND NEW.hackerrank_registered_at IS NULL)) THEN
    RAISE EXCEPTION 'Revoke the service before changing its username' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE tracking.platform_services (
  registration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  platform text NOT NULL CHECK (platform IN ('leetcode', 'gfg', 'hackerrank')),
  paused boolean NOT NULL DEFAULT false,
  agreement_version text,
  agreement_accepted_at timestamptz,
  UNIQUE (account_id, platform),
  CHECK ((agreement_version IS NULL) = (agreement_accepted_at IS NULL))
);
INSERT INTO tracking.platform_services (account_id, platform)
SELECT id, 'leetcode' FROM tracking.accounts WHERE leetcode_username IS NOT NULL
UNION ALL SELECT id, 'gfg' FROM tracking.accounts WHERE gfg_username IS NOT NULL
UNION ALL SELECT id, 'hackerrank' FROM tracking.accounts WHERE hackerrank_username IS NOT NULL;

-- Keep the platform generation in step with the existing canonical account fields.
CREATE FUNCTION tracking.sync_platform_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE service text; username text;
BEGIN
  FOR service, username IN SELECT * FROM (VALUES
    ('leetcode', NEW.leetcode_username), ('gfg', NEW.gfg_username), ('hackerrank', NEW.hackerrank_username)
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
CREATE TRIGGER accounts_platform_registration AFTER INSERT OR UPDATE OF leetcode_username, gfg_username, hackerrank_username
ON tracking.accounts FOR EACH ROW EXECUTE FUNCTION tracking.sync_platform_registration();

ALTER TABLE tracking.deliveries ADD COLUMN registration_id uuid;
UPDATE tracking.deliveries d SET registration_id = s.registration_id FROM tracking.platform_services s
WHERE d.account_id = s.account_id AND d.platform = s.platform;
ALTER TABLE tracking.deliveries ALTER COLUMN registration_id SET NOT NULL;
ALTER TABLE tracking.deliveries ADD FOREIGN KEY (registration_id) REFERENCES tracking.platform_services(registration_id) ON DELETE CASCADE;
-- Legacy callers inserting report rows still get the current generation.
CREATE FUNCTION tracking.set_delivery_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.registration_id IS NULL THEN
    SELECT registration_id INTO NEW.registration_id FROM tracking.platform_services
    WHERE account_id = NEW.account_id AND platform = NEW.platform;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER delivery_registration BEFORE INSERT ON tracking.deliveries
FOR EACH ROW EXECUTE FUNCTION tracking.set_delivery_registration();

CREATE TABLE tracking.daily_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  registration_id uuid NOT NULL REFERENCES tracking.platform_services(registration_id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('leetcode', 'gfg', 'hackerrank')),
  report_date date NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  recap_eligible boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collecting', 'complete', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  last_error text,
  UNIQUE (registration_id, report_date)
);
CREATE INDEX collections_pending ON tracking.daily_collections(report_date, next_attempt_at);

-- Shared reminders belong to the account, without any platform username or activity.
-- Retain this small ledger when revoking a platform so recovery cannot send a duplicate.
CREATE TABLE tracking.report_reminders (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  report_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, report_date)
);
INSERT INTO tracking.report_reminders (account_id, report_date, sent_at)
SELECT account_id, report_date, min(sent_at) FROM tracking.deliveries
WHERE messages = '["hmm..no question found.do it today, I will be waiting"]'::jsonb AND sent_at IS NOT NULL
GROUP BY account_id, report_date;
