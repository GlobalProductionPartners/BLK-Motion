-- BLK Motion license server schema (Cloudflare D1)
CREATE TABLE IF NOT EXISTS licenses (
  key        TEXT PRIMARY KEY,          -- BLKM-XXXX-XXXX-XXXX-XXXX
  customer   TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  seats      INTEGER NOT NULL DEFAULT 1,
  kind       TEXT NOT NULL DEFAULT 'full',   -- 'full' = drives hardware, 'demo' = silent
  note       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'active',  -- active | revoked
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key    TEXT NOT NULL REFERENCES licenses(key),
  machine_id     TEXT NOT NULL,
  machine_name   TEXT NOT NULL DEFAULT '',
  activated_at   TEXT NOT NULL,
  deactivated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_act_key ON activations (license_key, deactivated_at);
