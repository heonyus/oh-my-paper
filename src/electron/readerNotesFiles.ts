import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type DocumentId, documentIdSchema } from "../shared/ids"
import { mergeReaderNotes, type ReaderNote, readerNoteSchema } from "../shared/readerNote"
import { replaceFile } from "./fileReplace"

/** Each paper's note is a plain Markdown file the reader can open outside the app. */
function notesDirectory(root: string): string {
  return join(root, "reader-notes")
}

function notePath(root: string, documentId: DocumentId): string {
  return join(notesDirectory(root), `${documentId}.md`)
}

export async function readReaderNotes(root: string): Promise<ReaderNote[]> {
  let names: string[]
  try {
    names = await readdir(notesDirectory(root))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
    throw error
  }
  const notes: ReaderNote[] = []
  for (const name of names) {
    if (!name.endsWith(".md")) continue
    const documentId = documentIdSchema.safeParse(name.slice(0, -3))
    if (!documentId.success) continue
    const path = notePath(root, documentId.data)
    const [markdown, info] = await Promise.all([readFile(path, "utf8"), stat(path)])
    const note = readerNoteSchema.safeParse({
      documentId: documentId.data,
      markdown,
      updatedAt: info.mtime.toISOString(),
    })
    if (note.success) notes.push(note.data)
  }
  return notes
}

async function writeNote(root: string, note: ReaderNote): Promise<void> {
  await mkdir(notesDirectory(root), { recursive: true })
  const target = notePath(root, note.documentId)
  const temporary = `${target}.tmp`
  await writeFile(temporary, note.markdown, { encoding: "utf8", mode: 0o600 })
  await replaceFile(temporary, target)
}

/**
 * Merges a save into the stored notes and rewrites only the files whose text changed. Without
 * a baseline nothing counts as deleted, so a stale writer cannot remove a note.
 */
export async function saveReaderNotes(
  root: string,
  base: readonly ReaderNote[] | undefined,
  incoming: readonly ReaderNote[],
): Promise<void> {
  const stored = await readReaderNotes(root)
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
