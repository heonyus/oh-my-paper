import { ExternalLink, FileText, Link2 } from "lucide-react"
import { type JSX, useEffect, useState } from "react"
import type { KnowledgeNode } from "../../shared/knowledgeSchemas"
import type { KnowledgeClientOps } from "../lib/knowledgeTypes"
import type { DocumentRecord } from "../types"

type SavedPaper = {
  readonly node: KnowledgeNode
  readonly authors: readonly string[]
  readonly year: number | null
  readonly venue: string | null
  readonly abstract: string | null
  readonly landingUrl: string | null
}

type SavedPaperLoad = {
  readonly nodes: readonly KnowledgeNode[]
  readonly truncated: boolean
}

const PAPER_PAGE_SIZE = 100
const PAPER_PAGE_LIMIT = 10

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

function metadataValue(node: KnowledgeNode, key: string): unknown {
  return node.metadata[key]
}

function fullTextUrl(node: KnowledgeNode): string | null {
  const access = metadataValue(node, "access")
  if (typeof access !== "object" || access === null) return null
  const fullText = Reflect.get(access, "fullText")
  if (typeof fullText !== "object" || fullText === null) return null
  return stringValue(Reflect.get(fullText, "url"))
}

function savedPaper(node: KnowledgeNode): SavedPaper {
  const yearValue = metadataValue(node, "year")
  const year = typeof yearValue === "number" && Number.isInteger(yearValue) ? yearValue : null
  return {
    node,
    authors: stringArray(metadataValue(node, "authors")),
    year,
    venue: stringValue(metadataValue(node, "venue")),
    abstract: stringValue(metadataValue(node, "abstract")) ?? (node.body.trim() || null),
    landingUrl: fullTextUrl(node) ?? stringValue(metadataValue(node, "landingUrl")),
  }
}

function linkedToLocalDocument(node: KnowledgeNode, documents: readonly DocumentRecord[]): boolean {
  const record = metadataValue(node, "documentRecord")
  if (typeof record === "object" && record !== null && "hash" in record) {
    const hash = Reflect.get(record, "hash")
    if (typeof hash === "string" && documents.some((document) => document.hash === hash))
      return true
  }
  const documentId = stringValue(metadataValue(node, "documentId"))
  return documentId ? documents.some((document) => document.id === documentId) : false
}

export async function loadPaperPages(
  clientOps: Pick<KnowledgeClientOps, "findNodes">,
): Promise<SavedPaperLoad> {
  const nodes: KnowledgeNode[] = []
  for (let page = 0; page < PAPER_PAGE_LIMIT; page += 1) {
    const result = await clientOps.findNodes({
      kind: "paper",
      limit: PAPER_PAGE_SIZE,
      offset: page * PAPER_PAGE_SIZE,
    })
    nodes.push(...result)
    if (result.length < PAPER_PAGE_SIZE) return { nodes, truncated: false }
  }
  return { nodes, truncated: true }
}

export function LibrarySavedPapers({
  clientOps,
  documents,
  onOpenNode,
  onOpenExternal,
  active = true,
}: {
  readonly clientOps: Pick<KnowledgeClientOps, "findNodes"> | undefined
  readonly documents: readonly DocumentRecord[]
  readonly onOpenNode: ((id: KnowledgeNode["id"]) => void) | undefined
  readonly onOpenExternal: ((url: string) => void) | undefined
  readonly active?: boolean | undefined
}): JSX.Element | null {
  const [papers, setPapers] = useState<readonly SavedPaper[]>([])
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!clientOps || !active) return
    let isCurrent = true
    const requestToken = reloadToken
    void loadPaperPages(clientOps)
      .then(({ nodes, truncated: nextTruncated }) => {
        if (!isCurrent || requestToken !== reloadToken) return
        setPapers(nodes.filter((node) => !linkedToLocalDocument(node, documents)).map(savedPaper))
        setTruncated(nextTruncated)
        setError(null)
      })
      .catch(() => {
        if (!isCurrent || requestToken !== reloadToken) return
        setError("저장한 논문을 불러오지 못했습니다. 다시 시도하세요.")
      })
    return () => {
      isCurrent = false
    }
  }, [active, clientOps, documents, reloadToken])

  if (!clientOps || (papers.length === 0 && !error)) return null
  return (
    <section className="library-saved-papers" aria-label="저장한 논문">
      <div className="library-saved-papers-heading">
        <div>
          <span className="library-eyebrow">저장한 메타데이터</span>
          <h2>저장한 논문</h2>
        </div>
        <span>
          {papers.length}
          {truncated ? "+" : ""}개
        </span>
      </div>
      {error ? (
        <div className="library-saved-papers-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)}>
            다시 불러오기
          </button>
        </div>
      ) : null}
      {truncated ? (
        <p className="library-saved-papers-note">
          저장한 논문이 많아 처음 1,000개까지만 표시합니다.
        </p>
      ) : null}
      <ul>
        {papers.map((paper) => (
          <li key={paper.node.id}>
            <span className="library-saved-paper-icon" aria-hidden="true">
              <FileText size={16} />
            </span>
            <div>
              <strong>{paper.node.title}</strong>
              <p>
                {[paper.authors.slice(0, 3).join(", "), paper.year, paper.venue]
                  .filter(Boolean)
                  .join(" · ") || "서지 정보 확인 필요"}
              </p>
              {paper.abstract ? <small>{paper.abstract}</small> : null}
            </div>
            <div className="library-saved-paper-actions">
              {paper.landingUrl && onOpenExternal ? (
                <button
                  type="button"
                  aria-label={`${paper.node.title} 원문 열기`}
                  onClick={() => {
                    if (paper.landingUrl) onOpenExternal(paper.landingUrl)
                  }}
                >
                  <ExternalLink size={15} aria-hidden="true" />
                </button>
              ) : null}
              {onOpenNode ? (
                <button
                  type="button"
                  aria-label={`${paper.node.title} 논문 정보 열기`}
                  onClick={() => onOpenNode(paper.node.id)}
                >
                  <Link2 size={15} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
