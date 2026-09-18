import { z } from "zod"
import {
  assetRelativePathSchema,
  collectionRevisionSchema,
  noteConflictMetadataSchema,
  noteHistorySnapshotSchema,
  noteIdSchema,
  noteRelativePathSchema,
} from "./collectionSchemas"

export const MAX_ASSET_BYTES = 25 * 1024 * 1024
export const collectionChannels = {
  status: "collection:status",
  assetImport: "collection:asset-import",
  history: "collection:history",
  preview: "collection:history-preview",
  restore: "collection:restore",
  conflict: "collection:conflict",
  resolve: "collection:resolve-conflict",
  changed: "collection:changed",
  reveal: "collection:reveal",
}
export const collectionStatusSchema = z.object({
  state: z.enum(["ready", "degraded"]),
  indexComplete: z.boolean(),
  reliabilityWarning: z.string().nullable(),
  missingNoteIds: z.array(z.string().uuid()),
  unresolvedConflictIds: z.array(z.string().uuid()),
  lastScanAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
})
export const collectionAssetRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pick"), noteId: noteIdSchema.optional() }).strict(),
  z
    .object({
      kind: z.literal("bytes"),
      bytes: z
        .instanceof(Uint8Array)
        .refine((bytes) => bytes.length > 0 && bytes.length <= MAX_ASSET_BYTES),
      name: z.string().max(512),
      noteId: noteIdSchema.optional(),
    })
    .strict(),
])
export const collectionAssetResultSchema = z
  .object({
    relativePath: assetRelativePathSchema,
    markdownSource: z.string().max(512),
  })
  .nullable()
export const noteHistoryRequestSchema = z.object({ noteId: noteIdSchema }).strict()
export const noteHistoryResultSchema = z.object({
  noteId: noteIdSchema,
  relativePath: noteRelativePathSchema,
  currentRevision: collectionRevisionSchema,
  snapshots: z.array(noteHistorySnapshotSchema),
  conflicts: z.array(noteConflictMetadataSchema),
})
export const noteSnapshotRequestSchema = noteHistoryRequestSchema
  .extend({ snapshotId: z.string().uuid() })
  .strict()
export const noteRestoreRequestSchema = noteSnapshotRequestSchema
  .extend({ expectedRevision: collectionRevisionSchema })
  .strict()
export const noteSnapshotBodySchema = z.string().max(5_000_000)
export const noteConflictRequestSchema = z.object({ conflictId: z.string().uuid() }).strict()
export const noteConflictResultSchema = z.object({
  metadata: noteConflictMetadataSchema,
  currentRevision: collectionRevisionSchema,
  currentBody: noteSnapshotBodySchema.nullable(),
  incomingBody: noteSnapshotBodySchema,
})
export const noteConflictResolveSchema = noteConflictRequestSchema
  .extend({
    body: noteSnapshotBodySchema,
    expectedRevision: collectionRevisionSchema,
  })
  .strict()

export type CollectionApi = {
  readonly status: () => Promise<z.infer<typeof collectionStatusSchema>>
  readonly importAsset: (
    input: z.infer<typeof collectionAssetRequestSchema>,
  ) => Promise<z.infer<typeof collectionAssetResultSchema>>
  readonly history: (noteId: string) => Promise<z.infer<typeof noteHistoryResultSchema>>
  readonly preview: (input: z.infer<typeof noteSnapshotRequestSchema>) => Promise<string>
  readonly restore: (input: z.infer<typeof noteRestoreRequestSchema>) => Promise<void>
  readonly conflict: (conflictId: string) => Promise<z.infer<typeof noteConflictResultSchema>>
  readonly resolveConflict: (input: z.infer<typeof noteConflictResolveSchema>) => Promise<void>
  readonly reveal: () => Promise<void>
  readonly onChanged: (listener: () => void) => () => void
}
