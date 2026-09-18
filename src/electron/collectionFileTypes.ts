import type {
  CollectionRevision,
  NoteHistoryReason,
  NoteId,
  NoteRelativePath,
} from "../shared/collectionSchemas"

export type NoteFile = {
  readonly noteId: NoteId
  readonly relativePath: NoteRelativePath
  readonly revision: CollectionRevision
  readonly bytes: Uint8Array
}

export type SaveNoteInput = {
  readonly relativePath: string
  readonly bytes: Uint8Array
  readonly expectedRevision: string | null
  readonly reason: NoteHistoryReason
  readonly acknowledge?: (note: NoteFile) => Promise<void>
}

export type SaveNoteResult =
  | { readonly kind: "saved"; readonly note: NoteFile }
  | { readonly kind: "metadata_pending"; readonly operationId: string; readonly note: NoteFile }
  | {
      readonly kind: "conflict"
      readonly conflictId: string
      readonly currentRevision: CollectionRevision | null
      readonly incomingRevision: CollectionRevision
    }

export type CollectionFilesOptions = {
  readonly now?: () => Date
  readonly hooks?: {
    readonly afterJournalStaged?: () => Promise<void>
    readonly afterPrepared?: () => Promise<void>
    readonly afterRename?: () => Promise<void>
  }
}

export type AssetFile = {
  readonly relativePath: string
  readonly revision: CollectionRevision
}
