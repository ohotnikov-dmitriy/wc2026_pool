-- Cloudflare D1 schema for the WC2026 bracket pool (Keycloak / username auth).
-- Apply with:  wrangler d1 execute wc2026 --remote --file=worker/schema.sql
--
-- NOTE: if you previously created the OLD entries table (id/name/email), drop it once:
--   wrangler d1 execute wc2026 --remote --command "DROP TABLE IF EXISTS entries;"
-- then run this file. (Pre-launch test data is discarded; the results table is untouched.)

CREATE TABLE IF NOT EXISTS entries (
  username TEXT PRIMARY KEY,        -- Keycloak preferred_username (LDAP login)
  email    TEXT,                    -- optional
  picks    TEXT,                    -- JSON string of the bracket picks
  complete INTEGER NOT NULL DEFAULT 0,
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL
);

-- Single-row table holding the official ("actual") bracket everyone is scored against.
CREATE TABLE IF NOT EXISTS results (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  picks   TEXT,
  updated INTEGER
);
