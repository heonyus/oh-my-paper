import { z } from "zod"

export const COLLECTION_FORMAT = "scourgify-collection"
export const COLLECTION_SCHEMA_VERSION = 1

export const collectionIdSchema = z.string().uuid().brand("CollectionId")
export const noteIdSchema = z.string().uuid().brand("NoteId")
export const collectionRevisionSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand("CollectionRevision")

export const collectionRelativePathSchema = z
  .string()
  .min(1)
  .max(2_048)
  .superRefine((path, ctx) => {
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\0") ||
      path.includes(":") ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      ctx.addIssue({ code: "custom", message: "Path must be a safe portable relative path" })
    }
  })

export const noteRelativePathSchema = collectionRelativePathSchema.refine(
  (path) => path.startsWith("notes/") && path.toLocaleLowerCase("en-US").endsWith(".md"),
  "Note path must be inside notes/ and end in .md",
)

export const assetRelativePathSchema = collectionRelativePathSchema.refine(
  (path) => /^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(path),
  "Asset path must be content-addressed inside assets/",
)

export const collectionManifestSchema = z
  .object({
    format: z.literal(COLLECTION_FORMAT),
    schemaVersion: z.literal(COLLECTION_SCHEMA_VERSION),
    collectionId: collectionIdSchema,
  })
  .strict()

export const collectionManifestHeaderSchema = z.object({
  format: z.string(),
  schemaVersion: z.number().int(),
})

export const activeCollectionPointerSchema = z.object({
  schemaVersion: z.literal(1),
  collectionId: collectionIdSchema,
})

export const journalStateSchema = z.enum(["staged", "prepared", "file_committed"])
export const journalKindSchema = z.enum(["note", "asset"])

export const collectionJournalEntrySchema = z.object({
  operationId: z.string().uuid(),
  kind: journalKindSchema,
  state: journalStateSchema,
  relativePath: collectionRelativePathSchema,
  temporaryRelativePath: collectionRelativePathSchema,
  previousRelativePath: collectionRelativePathSchema.nullable(),
  incomingRelativePath: collectionRelativePathSchema,
  expectedRevision: collectionRevisionSchema.nullable(),
  previousRevision: collectionRevisionSchema.nullable(),
  nextRevision: collectionRevisionSchema,
  noteId: noteIdSchema.nullable(),
  createdAt: z.string().datetime(),
})

export const noteHistoryReasonSchema = z.enum([
  "typing",
  "explicit_save",
  "close",
  "external_change",
  "restore",
])

export const noteHistorySnapshotSchema = z.object({
  snapshotId: z.string().uuid(),
  noteId: noteIdSchema,
  revision: collectionRevisionSchema,
  reason: noteHistoryReasonSchema,
  createdAt: z.string().datetime(),
  bytesRelativePath: collectionRelativePathSchema,
})

export const noteConflictMetadataSchema = z.object({
  conflictId: z.string().uuid(),
  status: z.enum(["unresolved", "resolved"]),
  noteId: noteIdSchema,
  relativePath: noteRelativePathSchema,
  currentRevision: collectionRevisionSchema.nullable(),
  incomingRevision: collectionRevisionSchema,
  currentBytesRelativePath: collectionRelativePathSchema.nullable(),
  incomingBytesRelativePath: collectionRelativePathSchema,
  createdAt: z.string().datetime(),
})

export type CollectionId = z.infer<typeof collectionIdSchema>
export type NoteId = z.infer<typeof noteIdSchema>
export type CollectionRevision = z.infer<typeof collectionRevisionSchema>
export type CollectionManifest = z.infer<typeof collectionManifestSchema>
export type CollectionRelativePath = z.infer<typeof collectionRelativePathSchema>
export type NoteRelativePath = z.infer<typeof noteRelativePathSchema>
export type CollectionJournalEntry = z.infer<typeof collectionJournalEntrySchema>
export type NoteHistoryReason = z.infer<typeof noteHistoryReasonSchema>
export type NoteHistorySnapshot = z.infer<typeof noteHistorySnapshotSchema>
export type NoteConflictMetadata = z.infer<typeof noteConflictMetadataSchema>
export type ActiveCollectionPointer = z.infer<typeof activeCollectionPointerSchema>
