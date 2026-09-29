import type { Stats } from "node:fs"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type DocumentId, documentIdSchema } from "../shared/ids"
import { mergeReaderNotes, type ReaderNote, readerNoteSchema } from "../shared/readerNote"
import { replaceFile } from "./fileReplace"
import { deepFrozen } from "./knowledgeRowMemo"

/** Each paper's note is a plain Markdown file the reader can open outside the app. */
function notesDirectory(root: string): string {
  return join(root, "reader-notes")
}

function notePath(root: string, documentId: DocumentId): string {
  return join(notesDirectory(root), `${documentId}.md`)
}

/** Changes whenever a file is replaced or rewritten, including edits made outside the app. */
export function fileVersionOf(info: Stats): string {
  return `${info.ino}:${info.size}:${info.mtimeMs}`
}

type NoteFileEntry = {
  readonly documentId: DocumentId
  readonly version: string
  readonly note: ReaderNote | null
}

/**
 * The reader notes on disk, re-reading only the files whose version changed since the last
 * read. It returns the previous array itself when no file changed.
 */
export class ReaderNotesCache {
  private entries: readonly NoteFileEntry[] = []
  private notes: readonly ReaderNote[] = []

  constructor(private readonly root: string) {}

  async read(): Promise<readonly ReaderNote[]> {
    let names: string[]
    try {
      names = await readdir(notesDirectory(this.root))
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") names = []
      else throw error
    }
    const documentIds = names.flatMap((name) => {
      if (!name.endsWith(".md")) return []
      const documentId = documentIdSchema.safeParse(name.slice(0, -3))
      return documentId.success ? [documentId.data] : []
    })
    const previous = new Map(this.entries.map((entry) => [entry.documentId, entry]))
    const entries = await Promise.all(
      documentIds.map((documentId) => this.entryFor(documentId, previous.get(documentId))),
    )
    const unchanged =
      entries.length === this.entries.length &&
      entries.every((entry, index) => entry === this.entries[index])
    if (unchanged) return this.notes
    this.entries = entries
    this.notes = entries.flatMap((entry) => (entry.note ? [entry.note] : []))
    return this.notes
  }

  /** Stats before reading, so a write racing the read shows up as a new version next time. */
  private async entryFor(
    documentId: DocumentId,
    cached: NoteFileEntry | undefined,
  ): Promise<NoteFileEntry> {
    const path = notePath(this.root, documentId)
    const info = await stat(path)
    const version = fileVersionOf(info)
    if (cached?.version === version) return cached
    const note = readerNoteSchema.safeParse({
      documentId,
      markdown: await readFile(path, "utf8"),
      updatedAt: info.mtime.toISOString(),
    })
    return { documentId, version, note: note.success ? deepFrozen(note.data) : null }
  }
}

async function writeNote(root: string, note: ReaderNote): Promise<void> {
  await mkdir(notesDirectory(root), { recursive: true })
  const target = notePath(root, note.documentId)
  const temporary = `${target}.tmp`
  await writeFile(temporary, note.markdown, { encoding: "utf8", mode: 0o600 })
  await replaceFile(temporary, target)
}

/**
 * Merges a save into the notes just read from disk (`stored`) and rewrites only the files whose
 * text changed. Without a baseline nothing counts as deleted, so a stale writer cannot remove
 * a note.
 */
export async function saveReaderNotes(
  root: string,
  base: readonly ReaderNote[] | undefined,
  incoming: readonly ReaderNote[],
  stored: readonly ReaderNote[],
): Promise<void> {
  const storedById = new Map(stored.map((note) => [note.documentId, note]))
  const merged = mergeReaderNotes(base ?? [], stored, incoming)
  const mergedIds = new Set(merged.map((note) => note.documentId))
  for (const note of merged) {
    if (storedById.get(note.documentId)?.markdown !== note.markdown) await writeNote(root, note)
  }
  for (const note of stored) {
    if (!mergedIds.has(note.documentId)) await forgetReaderNote(root, note.documentId)
  }
}

export async function forgetReaderNote(root: string, documentId: DocumentId): Promise<void> {
  await rm(notePath(root, documentId), { force: true })
}
