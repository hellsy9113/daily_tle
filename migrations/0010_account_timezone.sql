ALTER TABLE tracking.accounts ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE tracking.deliveries ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE tracking.daily_collections ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';

-- Keep observations made under different day boundaries separate.
ALTER TABLE tracking.accepted_activity ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE tracking.accepted_activity DROP CONSTRAINT accepted_activity_pkey;
ALTER TABLE tracking.accepted_activity ADD PRIMARY KEY (account_id, activity_date, title_slug, timezone);
ALTER TABLE tracking.activity_days ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE tracking.activity_days DROP CONSTRAINT activity_days_pkey;
ALTER TABLE tracking.activity_days ADD PRIMARY KEY (account_id, activity_date, timezone);

ALTER TABLE tracking.accepted_activity DROP CONSTRAINT accepted_activity_check;
ALTER TABLE tracking.accepted_activity ADD CONSTRAINT accepted_activity_local_date_check
  CHECK (activity_date = (accepted_at AT TIME ZONE timezone)::date);
