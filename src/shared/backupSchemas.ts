import { z } from "zod"
import { collectionIdSchema, collectionRelativePathSchema } from "./collectionSchemas"

export const BACKUP_FORMAT = "scourgify-collection-backup" as const
export const BACKUP_SCHEMA_VERSION = 1 as const
export const MAX_BACKUP_ENTRIES = 100_000
export const MAX_BACKUP_FILE_BYTES = 250 * 1024 * 1024
export const MAX_BACKUP_TOTAL_BYTES = 2 * 1024 * 1024 * 1024

export const backupEntrySchema = z
  .object({
    path: collectionRelativePathSchema,
    size: z.number().int().nonnegative().max(MAX_BACKUP_FILE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

export const backupManifestSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    sourceCollectionId: collectionIdSchema,
    createdAt: z.string().datetime(),
    entries: z.array(backupEntrySchema).min(1).max(MAX_BACKUP_ENTRIES),
    excluded: z.array(z.string().min(1).max(512)).max(32),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = new Set<string>()
    for (const entry of manifest.entries) {
      if (paths.has(entry.path)) {
        context.addIssue({ code: "custom", message: `Duplicate backup entry: ${entry.path}` })
      }
      paths.add(entry.path)
    }
    const total = manifest.entries.reduce((sum, entry) => sum + entry.size, 0)
    if (total > MAX_BACKUP_TOTAL_BYTES) {
      context.addIssue({ code: "custom", message: "Backup exceeds the total size limit" })
    }
  })

export const backupCreateRequestSchema = z.object({}).strict()

export const backupRestoreRequestSchema = z.object({}).strict()

export const backupResultSchema = z
  .object({
    sourceCollectionId: collectionIdSchema,
    entryCount: z.number().int().positive(),
    totalBytes: z.number().int().nonnegative(),
  })
  .strict()

export const backupRestoreResultSchema = z
  .object({
    sourceCollectionId: collectionIdSchema,
    targetCollectionId: collectionIdSchema,
    entryCount: z.number().int().positive(),
    totalBytes: z.number().int().nonnegative(),
  })
  .strict()

export type BackupEntry = z.infer<typeof backupEntrySchema>
export type BackupManifest = z.infer<typeof backupManifestSchema>
export type BackupCreateRequest = z.infer<typeof backupCreateRequestSchema>
export type BackupRestoreRequest = z.infer<typeof backupRestoreRequestSchema>
export type BackupResult = z.infer<typeof backupResultSchema>
export type BackupRestoreResult = z.infer<typeof backupRestoreResultSchema>
