import {
  type BibliographyDuplicatePreview,
  type BibliographyExportResult,
  type BibliographyPaper,
  type BibliographyUpdateInput,
  bibliographyDuplicatePreviewInputSchema,
  bibliographyDuplicatePreviewSchema,
  bibliographyExportInputSchema,
  bibliographyExportResultSchema,
  bibliographyPaperSchema,
  bibliographyUpdateInputSchema,
} from "../shared/bibliographySchemas"
import type {
  KnowledgeNode,
  KnowledgeNodeId,
  NodeFilter,
  UpdateNodeInput,
} from "../shared/knowledgeTypes"
import {
  citationKeyBase,
  escapeBibtex,
  metadataFromNode,
  normalizeArxivId,
  normalizeDoi,
  normalizedList,
  storedCitationKey,
} from "./bibliographyMetadata"

export interface BibliographyRepository {
  readonly getNode: (id: KnowledgeNodeId) => KnowledgeNode | null
  readonly findNodes: (filter?: NodeFilter) => readonly KnowledgeNode[]
  readonly updateNode: (input: UpdateNodeInput) => KnowledgeNode
}

export class BibliographyError extends Error {
  readonly name = "BibliographyError"

  constructor(readonly code: "paper-not-found" | "not-a-paper") {
    super(code === "paper-not-found" ? "Paper not found" : "Bibliography requires a paper node")
  }
}

const PAPER_PAGE_SIZE = 100
const MAX_SCANNED_PAPERS = 10_000

function paperNodes(repository: BibliographyRepository): readonly KnowledgeNode[] {
  const nodes: KnowledgeNode[] = []
  for (let offset = 0; offset < MAX_SCANNED_PAPERS; offset += PAPER_PAGE_SIZE) {
    const page = repository.findNodes({ kind: "paper", limit: PAPER_PAGE_SIZE, offset })
    nodes.push(...page)
    if (page.length < PAPER_PAGE_SIZE) break
  }
  // ponytail: Above 10,000 papers, replace this bounded scan with a repository identifier index.
  return nodes
}

function requirePaper(repository: BibliographyRepository, id: KnowledgeNodeId): KnowledgeNode {
  const node = repository.getNode(id)
  if (!node) throw new BibliographyError("paper-not-found")
  if (node.kind !== "paper") throw new BibliographyError("not-a-paper")
  return node
}

function aliasesFor(node: KnowledgeNode, doi: string | null, arxivId: string | null) {
  const retained = node.aliases.filter((alias) => !/^(?:doi|arxiv):/iu.test(alias))
  return normalizedList([
    ...retained,
    ...(doi ? [`doi:${doi}`] : []),
    ...(arxivId ? [`arxiv:${arxivId}`] : []),
  ])
}

function bibtexEntry(paper: BibliographyPaper): string {
  const { metadata, node } = paper
  const fields = [
    `  title = {${escapeBibtex(node.title)}}`,
    metadata.authors.length
      ? `  author = {${metadata.authors.map(escapeBibtex).join(" and ")}}`
      : null,
    metadata.year ? `  year = {${metadata.year}}` : null,
    metadata.venue ? `  journal = {${escapeBibtex(metadata.venue)}}` : null,
    metadata.doi ? `  doi = {${escapeBibtex(metadata.doi)}}` : null,
    metadata.arxivId ? `  eprint = {${escapeBibtex(metadata.arxivId)}}` : null,
    metadata.arxivId ? "  archivePrefix = {arXiv}" : null,
    metadata.tags.length ? `  keywords = {${metadata.tags.map(escapeBibtex).join(", ")}}` : null,
  ].filter((field): field is string => field !== null)
  return `@article{${metadata.citationKey},\n${fields.join(",\n")}\n}`
}

function citationKeyFor(
  repository: BibliographyRepository,
  current: KnowledgeNode,
  input: BibliographyUpdateInput,
): string {
  const stored = storedCitationKey(current)
  if (stored) return stored
  const base = citationKeyBase(input.authors, input.year, input.title)
  const used = new Set(
    paperNodes(repository)
      .filter((node) => node.id !== current.id)
      .flatMap((node) => {
        const key = storedCitationKey(node)
        return key ? [key] : []
      }),
  )
  if (!used.has(base)) return base
  const suffix = current.id.replace(/-/gu, "").slice(0, 6)
  return `${base.slice(0, 80 - suffix.length)}${suffix}`
}

export class BibliographyService {
  constructor(private readonly repository: BibliographyRepository) {}

  getPaper(paperNodeId: KnowledgeNodeId): BibliographyPaper {
    const node = requirePaper(this.repository, paperNodeId)
    return bibliographyPaperSchema.parse({ node, metadata: metadataFromNode(node) })
  }

  updatePaper(value: BibliographyUpdateInput): BibliographyPaper {
    const input = bibliographyUpdateInputSchema.parse(value)
    const current = requirePaper(this.repository, input.paperNodeId)
    const doi = normalizeDoi(input.doi)
    const arxivId = normalizeArxivId(input.arxivId)
    const citationKey = citationKeyFor(this.repository, current, input)
    const updated = this.repository.updateNode({
      id: current.id,
      title: input.title,
      aliases: aliasesFor(current, doi, arxivId),
      metadata: {
        ...current.metadata,
        citationKey,
        authors: normalizedList(input.authors),
        year: input.year,
        doi,
        arxivId,
        venue: input.venue.trim(),
        tags: normalizedList(input.tags),
        readingState: input.readingState,
      },
    })
    return bibliographyPaperSchema.parse({ node: updated, metadata: metadataFromNode(updated) })
  }

  previewDuplicates(value: unknown): BibliographyDuplicatePreview {
    const input = bibliographyDuplicatePreviewInputSchema.parse(value)
    const doi = normalizeDoi(input.doi)
    const arxivId = normalizeArxivId(input.arxivId)
    const candidates = paperNodes(this.repository)
      .filter((node) => node.id !== input.paperNodeId)
      .flatMap((node) => {
        const metadata = metadataFromNode(node)
        const reasons = [
          doi && metadata.doi === doi ? "doi" : null,
          arxivId && metadata.arxivId === arxivId ? "arxiv" : null,
        ].filter((reason): reason is "doi" | "arxiv" => reason !== null)
        return reasons.length ? [{ paperNodeId: node.id, title: node.title, reasons }] : []
      })
      .slice(0, 100)
    return bibliographyDuplicatePreviewSchema.parse({ candidates })
  }

  exportBibtex(value: unknown): BibliographyExportResult {
    const input = bibliographyExportInputSchema.parse(value)
    const papers = input.paperNodeIds.map((id) => this.getPaper(id))
    return bibliographyExportResultSchema.parse({
      fileName: "references.bib",
      content: `${papers.map(bibtexEntry).join("\n\n")}\n`,
      count: papers.length,
    })
  }
}
