PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE login_challenges (
  id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL UNIQUE,
  pkce_challenge TEXT NOT NULL,
  client_key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consume_marker TEXT,
  consumed_subject TEXT
) STRICT;

CREATE INDEX login_challenges_expiry_idx
  ON login_challenges (expires_at, consumed_at);
CREATE INDEX login_challenges_client_idx
  ON login_challenges (client_key_hash, expires_at, consumed_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  last_rotated_at INTEGER NOT NULL,
  renewal_expires_at INTEGER NOT NULL,
  rotation_count INTEGER NOT NULL DEFAULT 0 CHECK (rotation_count BETWEEN 0 AND 4096),
  revoked_at INTEGER,
  revoke_reason TEXT
) STRICT;

CREATE INDEX sessions_account_active_idx
  ON sessions (account_id, revoked_at, renewal_expires_at, created_at);

CREATE TABLE renewal_tokens (
  token_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  revoked_at INTEGER,
  replacement_token_hash TEXT
) STRICT;

CREATE INDEX renewal_tokens_session_idx
  ON renewal_tokens (session_id, created_at);
CREATE INDEX renewal_tokens_account_idx
  ON renewal_tokens (account_id, expires_at, revoked_at);

CREATE TABLE rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
) STRICT, WITHOUT ROWID;

CREATE INDEX rate_limits_expiry_idx ON rate_limits (expires_at);
