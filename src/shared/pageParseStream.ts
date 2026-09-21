import { z } from "zod"
import { documentPageParseProgressSchema, documentPageParseResultSchema } from "./documentPageModel"

export const PAGE_PARSE_STREAM_MAX_BUFFER_CHARS = 8 * 1024 * 1024

export const pageParseStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    progress: documentPageParseProgressSchema,
  }),
  z.object({
    type: z.literal("result"),
    result: documentPageParseResultSchema,
  }),
  z.object({
    type: z.literal("error"),
    error: z.string().trim().min(1).max(500),
  }),
])

export type PageParseStreamEvent = z.infer<typeof pageParseStreamEventSchema>

export function encodePageParseStreamEvent(event: PageParseStreamEvent): string {
  const parsed = pageParseStreamEventSchema.parse(event)
  return `data: ${JSON.stringify(parsed)}\n\n`
}
