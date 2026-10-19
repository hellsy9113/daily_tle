ALTER TABLE tracking.accounts ADD COLUMN notes_registered_at timestamptz;
ALTER TABLE tracking.notebooks ADD COLUMN paused boolean NOT NULL DEFAULT false;
-- Keep existing notes, but require registration with the new code on Feature.
DELETE FROM tracking.notes_sessions;
