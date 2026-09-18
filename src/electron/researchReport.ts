import type { KnowledgeNodeId } from "../shared/knowledgeSchemas"
import type { CreateNodeInput } from "../shared/knowledgeTypes"
import type {
  ResearchCitation,
  ResearchJobId,
  ResearchModelDecision,
  ResearchReportDraft,
} from "../shared/researchJobSchemas"
import { researchReportDraftSchema } from "../shared/researchJobSchemas"
import type { ResearchSource } from "../shared/researchSourceSchemas"

export const researchDraftNotice = "AI가 작성한 초안입니다. 인용과 해석을 원문에서 확인하세요."

function citationFor(source: ResearchSource): ResearchCitation {
  const accessLabel =
    source.access === "metadata_only"
      ? "metadata-only"
      : source.access === "pdf_binary"
        ? "PDF binary only"
        : "full-text excerpt"
  return {
    sourceId: source.id,
    expectedContentHash: source.contentHash,
    url: source.finalUrl,
    page: source.page,
    snippet: source.snippet,
    accessLabel,
  }
}

function escapeLabel(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[\\[\]]/g, "\\$&")
}

function escapeInline(value: string): string {
  return value.replace(/[\\`*_[\]{}()#+.!<>|~-]/g, "\\$&").replace(/:\/\//g, ":\\/\\/")
}

function markdownDestination(value: string): string {
  return `<${value.replace(/\\/g, "%5C").replace(/</g, "%3C").replace(/>/g, "%3E")}>`
}

function verifiedDestination(
  raw: string,
  allowed: ReadonlyMap<string, string>,
): string | undefined {
  try {
    return allowed.get(new URL(raw).href)
  } catch {
    return undefined
  }
}

function sanitizeModelLinks(
  markdown: string,
  sources: readonly ResearchSource[],
): { readonly markdown: string; readonly removed: number } {
  const allowed = new Map<string, string>()
  for (const source of sources) {
    allowed.set(new URL(source.url).href, source.url)
    allowed.set(new URL(source.finalUrl).href, source.finalUrl)
  }
  let removed = 0
  // ponytail: drafts are capped at 2 MB; use the Markdown AST if nested link syntax becomes required.
  const linked = markdown.replace(
    /(!?\[[^\]\n]{0,500}\])\(\s*(<[^>\n]{1,8000}>|[^\s)\n]{1,8000})[^)\n]*\)/g,
    (_match, label: string, rawDestination: string) => {
      const destination = rawDestination.startsWith("<")
        ? rawDestination.slice(1, -1)
        : rawDestination
      const verified = verifiedDestination(destination, allowed)
      if (verified !== undefined) return `${label}(${markdownDestination(verified)})`
      removed += 1
      return `${label} (unsupported source link removed)`
    },
  )
  const autolinks = linked.replace(/<(https:\/\/[^>\s]{1,8000})>/g, (_match, rawUrl: string) => {
    const verified = verifiedDestination(rawUrl, allowed)
    if (verified !== undefined) return markdownDestination(verified)
    removed += 1
    return `${escapeInline(rawUrl)} (unsupported source link removed)`
  })
  const references = autolinks.replace(
    /^(\s{0,3}\[[^\]\n]{1,500}\]:)\s*(<[^>\n]{1,8000}>|[^\s\n]{1,8000}).*$/gm,
    (_match, label: string, rawDestination: string) => {
      const destination = rawDestination.startsWith("<")
        ? rawDestination.slice(1, -1)
        : rawDestination
      const verified = verifiedDestination(destination, allowed)
      if (verified !== undefined) return `${label} ${markdownDestination(verified)}`
      removed += 1
      return `${label} unsupported-source-link`
    },
  )
  const sanitized = references.replace(/\b(?:https?|ftp):\/\/[^\s<>"']{1,8000}/g, (rawUrl) => {
    const verified = verifiedDestination(rawUrl, allowed)
    if (verified !== undefined) return rawUrl
    removed += 1
    return "unsupported-source-link"
  })
  return { markdown: sanitized, removed }
}

function sourceLine(source: ResearchSource, citation: ResearchCitation): string {
  const page = citation.page === null ? "page unknown" : `p. ${citation.page}`
  const excerpt =
    citation.snippet === null
      ? "no validated excerpt"
      : escapeInline(citation.snippet.slice(0, 500))
  return `- [${escapeLabel(source.title)}](${markdownDestination(citation.url)}) — ${citation.accessLabel}; ${page}; ${excerpt}`
}

export function buildResearchReport(
  decision: ResearchModelDecision,
  sources: readonly ResearchSource[],
): ResearchReportDraft {
  if (decision.kind !== "report") throw new Error("A refinement decision is not a report")
  const byId = new Map(sources.map((source) => [source.id, source]))
  const selected = decision.sourceIds.map((id) => {
    const source = byId.get(id)
    if (source === undefined) throw new Error(`Model cited an unknown source ID: ${id}`)
    return source
  })
  const citations = selected.map(citationFor)
  const sanitized = sanitizeModelLinks(decision.markdown.trim(), selected)
  const sourceLines = selected.map((source, index) =>
    sourceLine(source, citations[index] ?? citationFor(source)),
  )
  const unsupported = selected.length === 0
  const unread = selected.some(
    (source) => source.access === "metadata_only" || source.access === "pdf_binary",
  )
  const notices = [
    unsupported ? "> Unsupported draft: no validated source references were returned." : null,
    unread
      ? "> Partial draft: at least one source is metadata-only or PDF-binary and was not read as passage text."
      : null,
    sanitized.removed > 0
      ? `> Unsupported links: ${sanitized.removed} model-authored link(s) did not match selected source records and were removed.`
      : null,
  ]
  const sections = [
    researchDraftNotice,
    sanitized.markdown,
    ...notices,
    "## Source references",
    ...sourceLines,
  ].filter((part) => part !== null && part !== "")
  return researchReportDraftSchema.parse({
    title: decision.title,
    markdown: sections.join("\n\n"),
    citations,
    partial: unsupported || unread || sanitized.removed > 0,
  })
}

export function reportNoteInput(
  jobId: ResearchJobId,
  report: ResearchReportDraft,
  title: string,
  markdown: string,
): CreateNodeInput {
  const savedMarkdown = markdown.startsWith(researchDraftNotice)
    ? markdown
    : `${researchDraftNotice}\n\n${markdown}`
  return {
    kind: "note",
    title,
    body: savedMarkdown,
    metadata: {
      research: {
        jobId,
        state: report.partial ? "partial" : "draft",
        citations: report.citations,
      },
    },
  }
}

export type ResearchNoteCreator = (
  input: CreateNodeInput,
) => Promise<{ readonly id: KnowledgeNodeId }>
