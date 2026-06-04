-- Cloudflare D1 schema for the WC2026 bracket pool (Keycloak / username auth).
-- Apply with:  wrangler d1 execute wc2026 --remote --file=worker/schema.sql
--
-- Fresh install: just run this file.
-- If you already have the entries table (without is_admin/extras), add the columns once:
--   wrangler d1 execute wc2026 --remote --command "ALTER TABLE entries ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;"
--   wrangler d1 execute wc2026 --remote --command "ALTER TABLE entries ADD COLUMN extras TEXT;"
--   wrangler d1 execute wc2026 --remote --command "ALTER TABLE results ADD COLUMN extras TEXT;"
--
-- Make someone an admin (they must have logged in at least once so the row exists):
--   wrangler d1 execute wc2026 --remote --command "UPDATE entries SET is_admin=1 WHERE username='ivanov';"

CREATE TABLE IF NOT EXISTS entries (
  username TEXT PRIMARY KEY,        -- Keycloak preferred_username (LDAP login)
  email    TEXT,                    -- optional
  picks    TEXT,                    -- JSON of the bracket picks
  extras   TEXT,                    -- JSON of the bonus/tie-break answers
  complete INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,  -- 1 = may save official results & view others' brackets
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  picks   TEXT,
  extras  TEXT,                    -- official correct bonus answers {yn:[...], goals:N}
  updated INTEGER
);
