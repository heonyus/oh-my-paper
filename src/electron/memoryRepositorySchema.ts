export const MEMORY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS semantic_memories (
  id TEXT PRIMARY KEY,
  derivation_key TEXT NOT NULL,
  text TEXT NOT NULL,
  conservative_token_estimate INTEGER NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  origin_kind TEXT NOT NULL,
  origin_model_version TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  invalidated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_scope_state
  ON semantic_memories(scope_kind, scope_key, state, updated_at DESC);
CREATE TABLE IF NOT EXISTS semantic_memory_evidence (
  memory_id TEXT NOT NULL,
  evidence_index INTEGER NOT NULL,
  kind TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  quote TEXT,
  page INTEGER,
  PRIMARY KEY (memory_id, evidence_index),
  FOREIGN KEY (memory_id) REFERENCES semantic_memories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_evidence_source
  ON semantic_memory_evidence(source_key, source_revision);
CREATE TABLE IF NOT EXISTS semantic_memory_tombstones (
  derivation_key TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  forgotten_at TEXT NOT NULL,
  PRIMARY KEY (derivation_key, scope_kind, scope_key)
);
CREATE TABLE IF NOT EXISTS factual_navigation_recents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  fact TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_navigation_recents_occurred
  ON factual_navigation_recents(occurred_at DESC, id DESC);
`
