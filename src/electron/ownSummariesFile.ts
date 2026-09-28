import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import type { DocumentId } from "../shared/ids"
import {
  mergeOwnSummaries,
  OWN_SUMMARIES_MAX,
  type OwnSummary,
  ownSummarySchema,
} from "../shared/ownSummary"

/**
 * The reader's own summaries live beside the knowledge database rather than in its insight
 * table, so an older build that reads the same data directory never meets an unknown kind.
 */
const ownSummariesFileSchema = z.object({
  summaries: z.array(ownSummarySchema).max(OWN_SUMMARIES_MAX),
})

function summariesPath(root: string): string {
  return join(root, "own-summaries.json")
}

/**
 * A missing file is an empty list. An unreadable one is moved aside instead of being
 * overwritten by the next save, so the reader's writing stays recoverable.
 */
export async function readOwnSummaries(root: string): Promise<OwnSummary[]> {
  const target = summariesPath(root)
  let raw: string
  try {
    raw = await readFile(target, "utf8")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
    throw error
  }
  try {
    return ownSummariesFileSchema.parse(JSON.parse(raw)).summaries
  } catch {
    await rename(target, `${target}.unreadable-${Date.now()}`)
    return []
  }
}

export async function writeOwnSummaries(
  root: string,
  summaries: readonly OwnSummary[],
): Promise<void> {
  const parsed = ownSummariesFileSchema.parse({ summaries })
  await mkdir(root, { recursive: true })
  const target = summariesPath(root)
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(parsed), { mode: 0o600 })
  await rename(temporary, target)
}

/**
 * Merges a save into the stored summaries. Without a baseline nothing counts as deleted,
 * so a writer holding a partial or stale workspace cannot drop the reader's lines.
 */
export async function saveOwnSummaries(
  root: string,
  base: readonly OwnSummary[] | undefined,
  incoming: readonly OwnSummary[],
): Promise<void> {
  const stored = await readOwnSummaries(root)
  await writeOwnSummaries(root, mergeOwnSummaries(base ?? [], stored, incoming))
}

export async function forgetOwnSummary(root: string, documentId: DocumentId): Promise<void> {
  const stored = await readOwnSummaries(root)
  if (!stored.some((summary) => summary.documentId === documentId)) return
  await writeOwnSummaries(
    root,
    stored.filter((summary) => summary.documentId !== documentId),
  )
}
