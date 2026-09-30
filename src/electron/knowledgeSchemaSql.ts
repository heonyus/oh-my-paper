export const KNOWLEDGE_SCHEMA_VERSION = 3

export const KNOWLEDGE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sidebar_open INTEGER NOT NULL DEFAULT 1,
  outline_width REAL NOT NULL DEFAULT 240,
  research_sidebar_width REAL NOT NULL DEFAULT 300,
  ui_font_family TEXT NOT NULL DEFAULT 'wanted',
  ui_font_scale REAL NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'system',
  minimap_visible INTEGER NOT NULL DEFAULT 1,
  viewport_x REAL NOT NULL DEFAULT 88,
  viewport_y REAL NOT NULL DEFAULT 36,
  viewport_zoom REAL NOT NULL DEFAULT 0.9,
  active_document_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_migration_markers (
  id TEXT PRIMARY KEY,
  migrated_at TEXT NOT NULL,
  source_file TEXT NOT NULL,
  node_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- DESC keeps equal timestamps in insertion order, as the unindexed sort returned them.
CREATE INDEX IF NOT EXISTS idx_nodes_kind_updated ON knowledge_nodes(kind, updated_at DESC);
-- The paper lookups must repeat these expressions verbatim for SQLite to use the indexes.
CREATE INDEX IF NOT EXISTS idx_nodes_paper_document_id
  ON knowledge_nodes(json_extract(metadata_json, '$.documentRecord.id'))
  WHERE kind = 'paper' AND json_valid(metadata_json);
CREATE INDEX IF NOT EXISTS idx_nodes_paper_document_hash
  ON knowledge_nodes(json_extract(metadata_json, '$.documentRecord.hash'))
  WHERE kind = 'paper' AND json_valid(metadata_json);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  original_document_id TEXT NOT NULL,
  paper_node_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (paper_node_id) REFERENCES knowledge_nodes(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_id ON document_versions(original_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_hash ON document_versions(hash);
CREATE INDEX IF NOT EXISTS idx_doc_versions_paper_node ON document_versions(paper_node_id);

CREATE TABLE IF NOT EXISTS evidence_anchors (
  id TEXT PRIMARY KEY,
  document_version_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  quote TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  fragments_json TEXT NOT NULL DEFAULT '[]',
  ast_ranges_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_version_id) REFERENCES document_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_evidence_doc_version ON evidence_anchors(document_version_id);

CREATE TABLE IF NOT EXISTS knowledge_relations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  provenance_source TEXT NOT NULL,
  provenance_model TEXT,
  provenance_extractor_version TEXT,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  source_endpoint_json TEXT,
  target_endpoint_json TEXT,
  review_state TEXT NOT NULL DEFAULT 'proposed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_relations_source ON knowledge_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON knowledge_relations(target_id);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS placements (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  card_id TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL DEFAULT 300,
  height REAL,
  minimized INTEGER NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_placements_board ON placements(board_id);
CREATE INDEX IF NOT EXISTS idx_placements_node ON placements(node_id);
CREATE INDEX IF NOT EXISTS idx_placements_card ON placements(card_id);

CREATE TABLE IF NOT EXISTS external_mappings (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  is_full_text_reviewed INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_mapping_system_id ON external_mappings(system, external_id);
CREATE INDEX IF NOT EXISTS idx_ext_mapping_node ON external_mappings(node_id);

CREATE TABLE IF NOT EXISTS document_insights (
  document_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, kind)
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_nodes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  aliases
);
`
