import { z } from "zod"
import type { KnowledgeNodeId } from "../shared/knowledgeSchemas"
import { researchModelDecisionSchema } from "../shared/researchJobSchemas"
import type { ResearchSource, WebDiscoveryResult } from "../shared/researchSourceSchemas"
import { researchSourceSchema } from "../shared/researchSourceSchemas"

export const researchModelResultSchema = z
  .object({
    decision: researchModelDecisionSchema,
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  })
  .readonly()

export type ResearchModelResult = z.infer<typeof researchModelResultSchema>

export interface ResearchRuntime {
  readonly search: (
    request: { readonly query: string; readonly maxResults: number },
    signal: AbortSignal,
  ) => Promise<{
    readonly providerRequestId: string
    readonly results: readonly WebDiscoveryResult[]
  }>
  readonly fetchSource: (source: WebDiscoveryResult, signal: AbortSignal) => Promise<ResearchSource>
  readonly readLocalSource: (
    sourceId: KnowledgeNodeId,
    signal: AbortSignal,
  ) => Promise<ResearchSource>
  readonly runModel: (
    input: {
      readonly question: string
      readonly sources: readonly ResearchSource[]
      readonly allowedEvidenceIds: readonly string[]
      readonly sourceContentIsUntrusted: true
      readonly allowRefine: boolean
    },
    signal: AbortSignal,
  ) => Promise<unknown>
}

export class ResearchRuntimeError extends Error {
  readonly name = "ResearchRuntimeError"

  constructor(
    readonly kind: "authentication" | "quota" | "network" | "invalid_response",
    message: string,
  ) {
    super(message)
  }
}

export function metadataSource(result: WebDiscoveryResult): ResearchSource {
  return researchSourceSchema.parse({
    id: result.sourceId,
    title: result.title,
    url: result.url,
    finalUrl: result.url,
    page: null,
    snippet: result.snippet,
    access: "metadata_only",
    origin: "web",
    contentType: null,
    byteLength: 0,
    contentHash: null,
    content: null,
    fetchedAt: null,
  })
}
