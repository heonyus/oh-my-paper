import { z } from "zod"
import { CollectionFrontmatterError } from "./collectionFrontmatter"
import { CollectionJournalError } from "./collectionJournal"
import { CollectionPathError } from "./collectionPaths"
import { CollectionWriterLockError } from "./collectionWriterLock"

export type CollectionFileErrorKind =
  | "invalid_collection"
  | "unsupported_schema"
  | "path_escape"
  | "path_collision"
  | "symlink_escape"
  | "unsupported_file"
  | "duplicate_note_id"
  | "invalid_note"
  | "writer_locked"
  | "writer_lock_changed"
  | "asset_collision"
  | "read_failed"
  | "write_failed"
  | "recovery_failed"

export class CollectionFileError extends Error {
  readonly name = "CollectionFileError"

  constructor(
    readonly kind: CollectionFileErrorKind,
    cause?: unknown,
  ) {
    super(cause instanceof Error ? `${kind}: ${cause.message}` : kind)
  }
}

export function collectionFileError(
  error: unknown,
  fallback: CollectionFileErrorKind,
): CollectionFileError {
  if (error instanceof CollectionFileError) return error
  if (error instanceof CollectionPathError) return new CollectionFileError(error.kind, error)
  if (error instanceof CollectionJournalError) {
    if (error.kind === "invalid_journal") return new CollectionFileError("recovery_failed", error)
    return new CollectionFileError(fallback, error)
  }
  if (error instanceof CollectionWriterLockError) return new CollectionFileError(error.kind, error)
  if (error instanceof CollectionFrontmatterError || error instanceof z.ZodError) {
    return new CollectionFileError("invalid_note", error)
  }
  return new CollectionFileError(fallback, error)
}
