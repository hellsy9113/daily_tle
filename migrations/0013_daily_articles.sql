ALTER TABLE tracking.accounts ADD COLUMN articles_registered_at timestamptz;

CREATE TABLE tracking.article_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url text NOT NULL UNIQUE CHECK (length(canonical_url) <= 2048),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 100),
  published_at timestamptz,
  topics text[] NOT NULL CHECK (cardinality(topics) BETWEEN 1 AND 5 AND topics <@ ARRAY['dsa','ai-ml','web','system-design','languages']::text[]),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 320),
  evergreen boolean NOT NULL DEFAULT false,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX article_catalog_topics_idx ON tracking.article_catalog USING gin(topics);
CREATE INDEX article_catalog_published_idx ON tracking.article_catalog(published_at DESC, canonical_url);
CREATE INDEX article_catalog_evergreen_idx ON tracking.article_catalog(published_at DESC) WHERE evergreen;

CREATE TABLE tracking.article_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES tracking.accounts(id) ON DELETE CASCADE,
  topics text[] NOT NULL CHECK (cardinality(topics) BETWEEN 1 AND 2 AND topics <@ ARRAY['dsa','ai-ml','web','system-design','languages']::text[] AND (cardinality(topics) = 1 OR topics[1] <> topics[2])),
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tracking.article_feed_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES tracking.article_subscriptions(id) ON DELETE CASCADE,
  feed_date date NOT NULL,
  topics text[] NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, feed_date),
  UNIQUE (id, subscription_id)
);
CREATE TABLE tracking.article_feed_items (
  day_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  article_id uuid NOT NULL REFERENCES tracking.article_catalog(id),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 6),
  topic text NOT NULL CHECK (topic IN ('dsa','ai-ml','web','system-design','languages')),
  FOREIGN KEY (day_id, subscription_id) REFERENCES tracking.article_feed_days(id, subscription_id) ON DELETE CASCADE,
  PRIMARY KEY (day_id, position),
  UNIQUE (day_id, article_id)
);
CREATE INDEX article_feed_items_subscription_idx ON tracking.article_feed_items(subscription_id);
CREATE TABLE tracking.article_seen (
  subscription_id uuid NOT NULL REFERENCES tracking.article_subscriptions(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES tracking.article_catalog(id),
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, article_id)
);
CREATE TABLE tracking.article_source_state (
  id text PRIMARY KEY,
  etag text,
  last_modified text,
  last_success_at timestamptz,
  next_fetch_at timestamptz NOT NULL DEFAULT '1970-01-01',
  failures integer NOT NULL DEFAULT 0,
  last_error text,
  lease_token text,
  lease_until timestamptz,
  robots_checked_at timestamptz,
  robots_allowed boolean,
  robots_delay_seconds integer NOT NULL DEFAULT 0
);
CREATE INDEX article_source_state_due_idx ON tracking.article_source_state(next_fetch_at, lease_until);
