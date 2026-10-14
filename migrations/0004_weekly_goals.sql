CREATE TABLE tracking.activity_goals (
  account_id uuid NOT NULL REFERENCES tracking.accounts(id),
  platform text NOT NULL CHECK (platform IN ('leetcode', 'gfg')),
  weekly_target integer NOT NULL CHECK (weekly_target BETWEEN 1 AND 1000),
  PRIMARY KEY (account_id, platform)
);
