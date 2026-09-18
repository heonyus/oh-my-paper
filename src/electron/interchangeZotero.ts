import { z } from "zod"
import {
  type ZoteroItemData,
  zoteroApiResponseItemSchema,
  zoteroItemDataSchema,
} from "../shared/interchangeSchemas"
import type { ZoteroImportItemPreview, ZoteroImportPreview } from "../shared/interchangeTypes"
import type { ExternalMapping, KnowledgeNode } from "../shared/knowledgeSchemas"

const metadataRecordSchema = z.object({
  doi: z.string().optional(),
})

export function parseZoteroExportJson(rawContent: string): readonly (ZoteroItemData & {
  readonly libraryType?: string
  readonly libraryId?: string | number
})[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (err) {
    throw new Error(`Invalid Zotero JSON: ${String(err)}`)
  }

  const arraySchema = z.array(z.unknown())
  const parseArray = arraySchema.safeParse(parsed)
  if (!parseArray.success) {
    throw new Error("Expected an array of Zotero items")
  }

  const items: (ZoteroItemData & { libraryType?: string; libraryId?: string | number })[] = []
  for (let i = 0; i < parseArray.data.length; i++) {
    const item = parseArray.data[i]
    // Check if item has a 'data' field (API format) or is a direct CSL/item object
    const apiItem = zoteroApiResponseItemSchema.safeParse(item)
    if (apiItem.success) {
      const lib = apiItem.data.library
      items.push({
        ...apiItem.data.data,
        ...(lib ? { libraryType: lib.type, libraryId: lib.id } : {}),
      })
      continue
    }
    const directItem = zoteroItemDataSchema.safeParse(item)
    if (directItem.success) {
      items.push(directItem.data)
      continue
    }
    throw new Error(`Item at index ${i} does not match Zotero schema: invalid item format`)
  }

  return items
}

export function previewZoteroImport(
  items: readonly (ZoteroItemData & {
    readonly libraryType?: string
    readonly libraryId?: string | number
  })[],
  existingMappings: readonly ExternalMapping[],
  _existingNodes: readonly KnowledgeNode[] = [],
  libraryKey = "default",
): ZoteroImportPreview {
  const mappingByKey = new Map<string, ExternalMapping>()

  for (const m of existingMappings) {
    if (m.system === "zotero") {
      mappingByKey.set(m.externalId, m)
    }
  }

  const seenKeys = new Set<string>()
  const duplicateKeysInBatch: string[] = []
  const itemPreviews: ZoteroImportItemPreview[] = []

  for (const item of items) {
    const effectiveLibKey =
      item.libraryType && item.libraryId !== undefined
        ? `${item.libraryType}:${item.libraryId}`
        : libraryKey
    const fullExternalId = `${effectiveLibKey}:${item.key}`
    if (seenKeys.has(fullExternalId)) {
      duplicateKeysInBatch.push(fullExternalId)
    } else {
      seenKeys.add(fullExternalId)
    }

    const existingMapping = mappingByKey.get(fullExternalId) ?? null
    let matchType: "none" | "external_id_match" | "doi_match" = "none"
    let proposedMergeNodeId: import("../shared/knowledgeSchemas").KnowledgeNodeId | null = null

    if (existingMapping) {
      matchType = "external_id_match"
    } else if (item.DOI) {
      const doiLower = item.DOI.toLowerCase().trim()
      for (const m of existingMappings) {
        const parsedMeta = metadataRecordSchema.safeParse(m.metadata)
        if (parsedMeta.success && parsedMeta.data.doi) {
          if (parsedMeta.data.doi.toLowerCase().trim() === doiLower) {
            matchType = "doi_match"
            proposedMergeNodeId = m.nodeId
            break
          }
        }
      }
    }

    const creatorNames = item.creators.map((c) => {
      if (c.name) return c.name
      const parts = [c.firstName, c.lastName].filter((p) => p !== undefined && p.length > 0)
      return parts.join(" ")
    })

    const preview: ZoteroImportItemPreview = {
      libraryKey: effectiveLibKey,
      itemKey: item.key,
      title: item.title,
      itemType: item.itemType,
      doi: item.DOI ?? null,
      date: item.date,
      creators: creatorNames,
      abstractNote: item.abstractNote,
      existingMapping,
      matchType,
      proposedMergeNodeId,
      ...(item.libraryType !== undefined ? { libraryType: item.libraryType } : {}),
      ...(item.libraryId !== undefined ? { libraryId: item.libraryId } : {}),
    }
    itemPreviews.push(preview)
  }

  const isValid = duplicateKeysInBatch.length === 0

  return {
    items: itemPreviews,
    duplicateKeysInBatch,
    totalItems: items.length,
    isValid,
  }
}
