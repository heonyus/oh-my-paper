import { z } from "zod"
import { evidenceAnchorIdSchema, knowledgeNodeIdSchema } from "./knowledgeIds"
import { sha256Schema } from "./schemas"

export const noteFragmentSchema = z
  .object({
    id: z.string().uuid().brand("NoteFragmentId"),
    nodeId: knowledgeNodeIdSchema,
    blockId: z.string().uuid().nullable(),
    revision: sha256Schema,
    quote: z.string().min(1).max(8_000),
    prefix: z.string().max(128),
    suffix: z.string().max(128),
    from: z.number().int().nonnegative(),
    to: z.number().int().positive(),
  })
  .refine((value) => value.to > value.from, { message: "Invalid fragment range" })

export const knowledgeEndpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("node"), nodeId: knowledgeNodeIdSchema }),
  z.object({ kind: z.literal("pdf-fragment"), anchorId: evidenceAnchorIdSchema }),
  z.object({ kind: z.literal("note-fragment"), anchor: noteFragmentSchema }),
])

export type NoteFragment = z.infer<typeof noteFragmentSchema>
export type KnowledgeEndpoint = z.infer<typeof knowledgeEndpointSchema>
export type FragmentLocation =
  | { readonly status: "resolved"; readonly from: number; readonly to: number }
  | { readonly status: "needs_repair"; readonly reason: "missing" | "ambiguous" | "block_missing" }

export function locateNoteFragment(
  anchor: NoteFragment,
  document: { readonly text: string; readonly revision: string },
): FragmentLocation {
  const { text } = document
  let start = 0
  let end = text.length
  if (anchor.blockId) {
    const marker = `<!-- scourgify:block:${anchor.blockId} -->`
    const markerStart = text.indexOf(marker)
    if (markerStart < 0) return { status: "needs_repair", reason: "block_missing" }
    if (text.indexOf(marker, markerStart + marker.length) >= 0) {
      return { status: "needs_repair", reason: "ambiguous" }
    }
    start = markerStart + marker.length
    const nextMarker = text.indexOf("<!-- scourgify:block:", start)
    if (nextMarker >= 0) end = nextMarker
  }
  if (
    document.revision === anchor.revision &&
    anchor.from >= start &&
    anchor.to <= end &&
    text.slice(anchor.from, anchor.to) === anchor.quote
  )
    return { status: "resolved", from: anchor.from, to: anchor.to }

  let match: number | undefined
  for (
    let from = text.indexOf(anchor.quote, start);
    from >= 0 && from < end;
    from = text.indexOf(anchor.quote, from + 1)
  ) {
    const to = from + anchor.quote.length
    if (to > end) break
    if (anchor.prefix && !text.slice(Math.max(0, from - 128), from).endsWith(anchor.prefix))
      continue
    if (anchor.suffix && !text.slice(to, to + 128).startsWith(anchor.suffix)) continue
    if (match !== undefined) return { status: "needs_repair", reason: "ambiguous" }
    match = from
  }
  return match === undefined
    ? { status: "needs_repair", reason: "missing" }
    : { status: "resolved", from: match, to: match + anchor.quote.length }
}
