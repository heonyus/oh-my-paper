import {
  type NoteId,
  type NoteRelativePath,
  noteIdSchema,
  noteRelativePathSchema,
} from "../shared/collectionSchemas"

const decoder = new TextDecoder("utf-8", { fatal: true })
const encoder = new TextEncoder()

export class CollectionFrontmatterError extends Error {
  readonly name = "CollectionFrontmatterError"

  constructor(readonly kind: "invalid_utf8" | "missing_note_id" | "duplicate_note_id") {
    super(kind)
  }
}

export function readCanonicalNoteId(bytes: Uint8Array): NoteId {
  const source = decodeNote(bytes)
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/)
  if (lines[0] !== "---") throw new CollectionFrontmatterError("missing_note_id")
  const closing = lines.slice(1).indexOf("---")
  if (closing < 0) throw new CollectionFrontmatterError("missing_note_id")
  const frontmatter = lines.slice(1, closing + 1)
  const candidates: string[] = []
  for (let index = 0; index < frontmatter.length; index += 1) {
    const line = frontmatter[index]
    if (line === undefined) continue
    const dotted = line.match(/^scourgify\.id:\s*["']?([^\s"']+)["']?\s*$/)
    if (dotted?.[1]) candidates.push(dotted[1])
    const namespace = line.match(/^(\s*)scourgify:\s*$/)
    if (!namespace) continue
    const namespaceIndent = namespace[1]?.length ?? 0
    const children: string[] = []
    for (const candidate of frontmatter.slice(index + 1)) {
      if (candidate.trim() === "") continue
      const indent = candidate.match(/^\s*/)?.[0].length ?? 0
      if (indent <= namespaceIndent) break
      children.push(candidate)
    }
    const childIndent = Math.min(
      ...children.map((candidate) => candidate.match(/^\s*/)?.[0].length ?? 0),
    )
    for (const child of children) {
      const nested = child.match(/^(\s*)id:\s*["']?([^\s"']+)["']?\s*$/)
      if (nested?.[1] && nested[2] && nested[1].length === childIndent) {
        candidates.push(nested[2])
      }
    }
  }
  if (candidates.length === 0) throw new CollectionFrontmatterError("missing_note_id")
  if (candidates.length > 1) throw new CollectionFrontmatterError("duplicate_note_id")
  return noteIdSchema.parse(candidates[0])
}

function decodeNote(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) throw new CollectionFrontmatterError("invalid_utf8")
    throw error
  }
}

function bodyStart(source: string): number {
  const withoutBom = source.startsWith("\uFEFF") ? source.slice(1) : source
  const match = /^(---)(\r?\n)[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(withoutBom)
  if (!match) throw new CollectionFrontmatterError("missing_note_id")
  return source.length - withoutBom.length + match[0].length
}

export function readCanonicalNoteBody(bytes: Uint8Array): string {
  const source = decodeNote(bytes)
  readCanonicalNoteId(bytes)
  return source.slice(bodyStart(source))
}

export function replaceCanonicalNoteBody(bytes: Uint8Array, body: string): Uint8Array {
  const source = decodeNote(bytes)
  readCanonicalNoteId(bytes)
  return encoder.encode(`${source.slice(0, bodyStart(source))}${body}`)
}

export function createCanonicalNoteBytes(noteId: string, body: string): Uint8Array {
  const id = noteIdSchema.parse(noteId)
  return encoder.encode(`---\nscourgify:\n  id: ${id}\n---\n${body}`)
}

export function initialNoteRelativePath(noteId: string): NoteRelativePath {
  return noteRelativePathSchema.parse(`notes/${noteIdSchema.parse(noteId)}.md`)
}
