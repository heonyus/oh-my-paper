import { z } from "zod"
import { type AiDocumentEnrichment, aiDocumentEnrichmentSchema } from "../shared/documentAst"

const nodeIdSchema = z.string().regex(/^node:[a-zA-Z0-9._-]+$/u)
const boundsSchema = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict()

export const structureResolverInputSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    candidateNodeIds: z
      .array(nodeIdSchema)
      .min(1)
      .max(64)
      .refine((ids) => new Set(ids).size === ids.length),
    context: z.string().min(1).max(8_000),
    crop: z
      .object({
        dataUrl: z.string().startsWith("data:image/").max(8_000_000),
        decodedImageBytes: z
          .number()
          .int()
          .positive()
          .max(4 * 1024 * 1024),
        longestEdge: z.number().int().positive().max(2_048),
        bounds: boundsSchema,
      })
      .strict()
      .optional(),
  })
  .strict()

export const structureResolverOutputSchema = z
  .object({
    orderedNodeIds: z.array(nodeIdSchema).min(1).max(64),
    relations: z
      .array(
        z
          .object({
            from: nodeIdSchema,
            to: nodeIdSchema,
            kind: z.enum(["parent", "child", "order", "caption", "reference"]),
            confidence: z.number().min(0).max(1),
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(128),
  })
  .strict()

export class StructureResolverOutputError extends Error {
  readonly name = "StructureResolverOutputError"

  constructor(readonly reason: "malformed_output") {
    super(reason)
  }
}

export type StructureResolverInput = z.infer<typeof structureResolverInputSchema>
export type StructureResolverOutput = z.infer<typeof structureResolverOutputSchema>

export function validateStructureResolverOutput(
  input: StructureResolverInput,
  output: unknown,
): StructureResolverOutput {
  const parsed = structureResolverOutputSchema.safeParse(output)
  if (!parsed.success) throw new StructureResolverOutputError("malformed_output")
  const candidates = new Set(input.candidateNodeIds)
  if (
    parsed.data.orderedNodeIds.length !== candidates.size ||
    new Set(parsed.data.orderedNodeIds).size !== candidates.size
  ) {
    throw new StructureResolverOutputError("malformed_output")
  }
  if (parsed.data.orderedNodeIds.some((id) => !candidates.has(id)))
    throw new StructureResolverOutputError("malformed_output")
  if (
    parsed.data.relations.some(
      (relation) =>
        relation.from === relation.to ||
        !candidates.has(relation.from) ||
        !candidates.has(relation.to),
    )
  ) {
    throw new StructureResolverOutputError("malformed_output")
  }
  return parsed.data
}

export function toStructureEnrichment(
  sourceHash: string,
  output: StructureResolverOutput,
): AiDocumentEnrichment {
  return aiDocumentEnrichmentSchema.parse({
    schemaVersion: "1.0.0",
    sourceHash,
    candidates: output.orderedNodeIds.map((nodeId) => ({
      nodeId,
      kind: "reading_order",
      confidence: output.relations.find((relation) => relation.from === nodeId)?.confidence ?? 0.5,
      origin: "ai",
    })),
  })
}
