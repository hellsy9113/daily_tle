ALTER TABLE tracking.article_subscriptions
  ADD COLUMN next_refresh_at timestamptz NOT NULL DEFAULT '1970-01-01';
