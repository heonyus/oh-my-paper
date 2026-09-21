import { z } from "zod"
import { knowledgeNodeSchema } from "./knowledgeSchemas"
import {
  scholarlySearchItemSchema,
  scholarlySearchRequestSchema,
  type scholarlySearchResultSchema,
} from "./scholarlySearchSchemas"

export const discoveryChannels = {
  search: "discovery:scholarly-search",
  cancel: "discovery:scholarly-cancel",
  saveMetadata: "discovery:save-metadata",
  listSavedMetadata: "discovery:list-saved-metadata",
} as const

export const discoveryJobIdSchema = z.string().uuid().brand("DiscoveryJobId")

export const discoverySearchInputSchema = z
  .object({ jobId: discoveryJobIdSchema, request: scholarlySearchRequestSchema })
  .readonly()

export const discoveryCancelInputSchema = z.object({ jobId: discoveryJobIdSchema }).readonly()
export const discoveryCancelResultSchema = z.object({ cancelled: z.boolean() }).readonly()

export const discoverySaveInputSchema = z.object({ item: scholarlySearchItemSchema }).readonly()
export const discoverySaveResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), node: knowledgeNodeSchema }).readonly(),
  z.object({ status: z.literal("duplicate"), node: knowledgeNodeSchema }).readonly(),
])
export const discoverySavedMetadataResultSchema = z
  .object({ items: z.array(knowledgeNodeSchema).max(1_000).readonly() })
  .readonly()

export interface DiscoveryApi {
  readonly search: (
    input: DiscoverySearchInput,
  ) => Promise<z.infer<typeof scholarlySearchResultSchema>>
  readonly cancel: (input: DiscoveryCancelInput) => Promise<DiscoveryCancelResult>
  readonly saveMetadata: (input: DiscoverySaveInput) => Promise<DiscoverySaveResult>
  readonly listSavedMetadata: () => Promise<DiscoverySavedMetadataResult>
}

export type DiscoveryJobId = z.infer<typeof discoveryJobIdSchema>
export type DiscoverySearchInput = z.input<typeof discoverySearchInputSchema>
export type DiscoveryCancelInput = z.infer<typeof discoveryCancelInputSchema>
export type DiscoveryCancelResult = z.infer<typeof discoveryCancelResultSchema>
export type DiscoverySaveInput = z.infer<typeof discoverySaveInputSchema>
export type DiscoverySaveResult = z.infer<typeof discoverySaveResultSchema>
export type DiscoverySavedMetadataResult = z.infer<typeof discoverySavedMetadataResultSchema>
