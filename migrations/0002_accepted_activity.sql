CREATE TABLE tracking.accepted_activity (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  activity_date date NOT NULL,
  title_slug text NOT NULL CHECK (length(title_slug) > 0),
  title text NOT NULL,
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, activity_date, title_slug),
  CHECK (activity_date = (accepted_at AT TIME ZONE 'Asia/Kolkata')::date)
);

CREATE TABLE tracking.activity_days (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  activity_date date NOT NULL,
  observed_from timestamptz,
  observed_until timestamptz NOT NULL,
  covered_until timestamptz,
  checked_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, activity_date),
  CHECK (covered_until IS NULL OR covered_until <= observed_until)
);

CREATE TABLE tracking.activity_sync (
  account_id uuid PRIMARY KEY REFERENCES tracking.accounts(id),
  refreshed_at timestamptz,
  lease_token text,
  lease_until timestamptz,
  last_error integer CHECK (last_error IS NULL OR last_error IN (404, 502, 503, 504))
);
