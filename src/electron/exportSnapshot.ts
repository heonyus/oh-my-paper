import type { Root } from "mdast"
import {
  type ExportAsset,
  type ExportBibliographyEntry,
  type ExportLimitation,
  type ExportRecord,
  type ExportSnapshotInput,
  type ExportSourceReference,
  exportSnapshotInputSchema,
} from "../shared/exportSchemas"
import { sanitizeExportMarkdown } from "./exportMarkdownTree"
import { addExportLimitation, safeExportHref, sanitizeExportText } from "./exportSanitize"

export type ExportSnapshotAsset = Omit<ExportAsset, "source">

export type ExportSnapshot = {
  readonly title: string
  readonly revision: string
  readonly root: Root
  readonly records: readonly ExportRecord[]
  readonly assets: readonly ExportSnapshotAsset[]
  readonly bibliography: readonly ExportBibliographyEntry[]
  readonly sources: readonly ExportSourceReference[]
  readonly limitations: readonly ExportLimitation[]
}

function sanitizeUrl(value: string | null, limitations: ExportLimitation[]): string | null {
  if (value === null) return null
  const safe = safeExportHref(value)
  if (safe) return safe
  addExportLimitation(limitations, {
    code: "unsafe_link_removed",
    detail: "A non-portable or unsafe metadata link was removed.",
  })
  return null
}

function sanitizeRecord(record: ExportRecord, limitations: ExportLimitation[]): ExportRecord {
  return {
    ...record,
    title: sanitizeExportText(record.title, limitations),
    aliases: record.aliases.map((alias) => sanitizeExportText(alias, limitations)),
    evidence: record.evidence.map((item) => ({
      ...item,
      quote: sanitizeExportText(item.quote, limitations),
    })),
    relations: record.relations.map((relation) => ({
      ...relation,
      provenance: {
        ...relation.provenance,
        model: relation.provenance.model
          ? sanitizeExportText(relation.provenance.model, limitations)
          : null,
        extractorVersion: relation.provenance.extractorVersion
          ? sanitizeExportText(relation.provenance.extractorVersion, limitations)
          : null,
      },
    })),
  }
}

function sanitizeReferences(
  input: ExportSnapshotInput,
  limitations: ExportLimitation[],
): {
  readonly bibliography: readonly ExportBibliographyEntry[]
  readonly sources: readonly ExportSourceReference[]
} {
  return {
    bibliography: input.bibliography.map((entry) => ({
      ...entry,
      text: sanitizeExportText(entry.text, limitations),
      url: sanitizeUrl(entry.url, limitations),
    })),
    sources: input.sources.map((source) => ({
      ...source,
      label: sanitizeExportText(source.label, limitations),
      locator: sanitizeExportText(source.locator, limitations),
      url: sanitizeUrl(source.url, limitations),
    })),
  }
}

export function createExportSnapshot(unchecked: unknown): ExportSnapshot {
  const input = exportSnapshotInputSchema.parse(unchecked)
  const limitations: ExportLimitation[] = []
  const root = sanitizeExportMarkdown(input.markdown, input.assets, limitations)
  const references = sanitizeReferences(input, limitations)
  if (references.sources.some((source) => source.availability !== "portable")) {
    addExportLimitation(limitations, {
      code: "source_link_unavailable",
      detail:
        "Source links marked scourgify_only require Scourgify; unavailable sources cannot be opened from this export.",
    })
  }
  return {
    title: sanitizeExportText(input.title, limitations),
    revision: input.revision,
    root,
    records: input.records.map((record) => sanitizeRecord(record, limitations)),
    assets: input.assets.map(({ source: _source, ...asset }) => ({
      ...asset,
      altText: sanitizeExportText(asset.altText, limitations),
    })),
    bibliography: references.bibliography,
    sources: references.sources,
    limitations,
  }
}
