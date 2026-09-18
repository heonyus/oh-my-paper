import { z } from "zod"
import { createEvidenceAnchorInputSchema } from "./knowledgeIpc"
import {
  evidenceAnchorIdSchema,
  knowledgeNodeIdSchema,
  knowledgeNodeSchema,
  knowledgeRelationSchema,
  relationPredicateSchema,
} from "./knowledgeSchemas"
import { documentIdSchema, sha256Schema } from "./schemas"

export const linkEvidenceInputSchema = z.object({
  documentId: documentIdSchema,
  hash: sha256Schema,
  anchor: createEvidenceAnchorInputSchema.omit({ id: true, documentVersionId: true }),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("existing"), nodeId: knowledgeNodeIdSchema }),
    z.object({
      type: z.literal("new"),
      kind: z.enum(["concept", "question", "hypothesis", "claim", "note"]),
      title: z.string().trim().min(1).max(500),
    }),
  ]),
})
export type LinkEvidenceInput = z.infer<typeof linkEvidenceInputSchema>
export const proposalScopeSchema = z.object({
  nodeIds: z.array(knowledgeNodeIdSchema).min(2).max(12),
})
export const proposedRelationsSchema = z.object({
  relations: z
    .array(
      z.object({
        sourceId: knowledgeNodeIdSchema,
        targetId: knowledgeNodeIdSchema,
        predicate: relationPredicateSchema,
        evidenceIds: z.array(evidenceAnchorIdSchema).min(1).max(8),
      }),
    )
    .max(12),
})
export const knowledgeActionChannels = {
  linkEvidence: "knowledge:link-evidence",
  propose: "knowledge:propose-relations",
  cancel: "knowledge:cancel-proposal",
}
export const proposalResultSchema = z.array(knowledgeRelationSchema)
export { knowledgeNodeSchema }
