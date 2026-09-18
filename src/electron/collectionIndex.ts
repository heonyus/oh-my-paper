import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { CollectionRevision, NoteId, NoteRelativePath } from "../shared/collectionSchemas"
import {
  collectionRevisionSchema,
  noteIdSchema,
  noteRelativePathSchema,
} from "../shared/collectionSchemas"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"
import type { NoteFile } from "./collectionFiles"
import { readCanonicalNoteBody } from "./collectionFrontmatter"
import { sanitizeFtsQuery } from "./knowledgeRepositoryQueries"

const indexedNoteRowSchema = z.object({
  note_id: z.string(),
  relative_path: z.string(),
  revision: z.string(),
  body: z.string(),
  bytes: z.instanceof(Uint8Array),
})

const idRowSchema = z.object({ note_id: z.string() })

export type IndexedNote = {
  readonly noteId: NoteId
  readonly relativePath: NoteRelativePath
  readonly revision: CollectionRevision
  readonly body: string
  readonly bytes: Uint8Array
}

export type NoteIndexMetadata = {
  readonly title: string
  readonly aliases: readonly string[]
}

export class CollectionIndex {
  readonly db: DatabaseSync

  constructor(readonly filePath: string) {
    if (filePath !== ":memory:" && !existsSync(dirname(filePath))) {
      mkdirSync(dirname(filePath), { recursive: true })
    }
    this.db = new DatabaseSync(filePath)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS indexed_notes (
        note_id TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL UNIQUE,
        revision TEXT NOT NULL,
        body TEXT NOT NULL,
        bytes BLOB NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS indexed_notes_fts USING fts5(
        note_id UNINDEXED, title, body, aliases
      );
      CREATE TABLE IF NOT EXISTS index_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), complete INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO index_state (id, complete) VALUES (1, 0);
    `)
  }

  close(): void {
    this.db.close()
  }

  get(noteId: string): IndexedNote | null {
    const id = noteIdSchema.parse(noteId)
    const raw = this.db.prepare("SELECT * FROM indexed_notes WHERE note_id = ?").get(id)
    if (!raw) return null
    const row = indexedNoteRowSchema.parse(raw)
    return {
      noteId: noteIdSchema.parse(row.note_id),
      relativePath: noteRelativePathSchema.parse(row.relative_path),
      revision: collectionRevisionSchema.parse(row.revision),
      body: row.body,
      bytes: row.bytes,
    }
  }

  upsert(note: NoteFile, metadata: NoteIndexMetadata): IndexedNote {
    const body = readCanonicalNoteBody(note.bytes)
    this.db.exec("BEGIN IMMEDIATE")
    try {
      this.db
        .prepare(`INSERT INTO indexed_notes (note_id, relative_path, revision, body, bytes)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(note_id) DO UPDATE SET
            relative_path = excluded.relative_path,
            revision = excluded.revision,
            body = excluded.body,
            bytes = excluded.bytes`)
        .run(note.noteId, note.relativePath, note.revision, body, note.bytes)
      this.db.prepare("DELETE FROM indexed_notes_fts WHERE note_id = ?").run(note.noteId)
      this.db
        .prepare(
          "INSERT INTO indexed_notes_fts (note_id, title, body, aliases) VALUES (?, ?, ?, ?)",
        )
        .run(note.noteId, metadata.title, body, metadata.aliases.join(" "))
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
    const indexed = this.get(note.noteId)
    if (!indexed) throw new Error(`Index write missing: ${note.noteId}`)
    return indexed
  }

  remove(noteId: string): void {
    const id = noteIdSchema.parse(noteId)
    this.db.prepare("DELETE FROM indexed_notes WHERE note_id = ?").run(id)
    this.db.prepare("DELETE FROM indexed_notes_fts WHERE note_id = ?").run(id)
  }

  searchIds(search: string, limit = 100): readonly string[] {
    const query = sanitizeFtsQuery(search)
    if (!query) return []
    const rows = this.db
      .prepare("SELECT note_id FROM indexed_notes_fts WHERE indexed_notes_fts MATCH ? LIMIT ?")
      .all(query, Math.min(Math.max(1, limit), 100))
    return rows.map((raw) => knowledgeNodeIdSchema.parse(idRowSchema.parse(raw).note_id))
  }

  list(): readonly IndexedNote[] {
    return this.db
      .prepare("SELECT * FROM indexed_notes ORDER BY note_id")
      .all()
      .map((raw) => {
        const row = indexedNoteRowSchema.parse(raw)
        return {
          noteId: noteIdSchema.parse(row.note_id),
          relativePath: noteRelativePathSchema.parse(row.relative_path),
          revision: collectionRevisionSchema.parse(row.revision),
          body: row.body,
          bytes: row.bytes,
        }
      })
  }

  rebuild(notes: readonly NoteFile[], metadataFor: (noteId: NoteId) => NoteIndexMetadata): void {
    this.db.exec(
      "DELETE FROM indexed_notes; DELETE FROM indexed_notes_fts; UPDATE index_state SET complete = 0 WHERE id = 1;",
    )
    for (const note of notes) this.upsert(note, metadataFor(note.noteId))
    this.db.prepare("UPDATE index_state SET complete = 1 WHERE id = 1").run()
  }

  isComplete(): boolean {
    const row = z
      .object({ complete: z.number().int() })
      .parse(this.db.prepare("SELECT complete FROM index_state WHERE id = 1").get())
    return row.complete === 1
  }
}
