ALTER TABLE tracking.deliveries
  ADD COLUMN cadence text NOT NULL DEFAULT 'daily'
  CHECK (cadence IN ('daily', 'weekly'));
ALTER TABLE tracking.deliveries
  DROP CONSTRAINT deliveries_account_platform_date_unique;
ALTER TABLE tracking.deliveries
  ADD CONSTRAINT deliveries_account_platform_date_cadence_unique
  UNIQUE (account_id, platform, report_date, cadence);
