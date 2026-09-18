import type { JSX } from "react"
import { useEffect, useState } from "react"
import type { ScholarlySearchResult } from "../../shared/scholarlySearchSchemas"
import {
  type ScholarlyProviderState,
  scholarlySearchResultSchema,
} from "../../shared/scholarlySearchSchemas"
import type { DocumentRecord } from "../types"

const providerLabels: Record<ScholarlyProviderState["provider"], string> = {
  crossref: "Crossref",
  arxiv: "arXiv",
  openalex: "OpenAlex",
}

const providerErrorLabels: Record<string, string> = {
  rate_limited: "요청 한도 초과",
  timeout: "시간 초과",
  oversized: "응답 초과",
  cancelled: "취소됨",
  network: "네트워크 오류",
  http_error: "HTTP 오류",
  malformed_response: "응답 형식 오류",
}

function providerStateLabel(state: ScholarlyProviderState): string {
  const name = providerLabels[state.provider]
  if (state.status === "success")
    return `${name} ${state.resultCount}건${state.freshness === "cached" ? "(캐시)" : ""}`
  const kind = providerErrorLabels[state.error.kind] ?? state.error.kind
  return `${name} ${kind}`
}

export function ScholarSearchPanel({
  document,
}: {
  readonly document: DocumentRecord
}): JSX.Element {
  const [result, setResult] = useState<ScholarlySearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(null)
    const query = document.title?.trim() || document.name.replace(/\.pdf$/i, "")
    void fetch("/api/rpc/scholarlySearch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, pageSize: 10 }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: "unknown" }))
          throw new Error(body.error ?? `HTTP ${response.status}`)
        }
        const data = scholarlySearchResultSchema.parse(await response.json())
        if (!controller.signal.aborted) setResult(data)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : "검색 실패")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [document.title, document.name])

  if (loading) return <p className="mode-empty">관련 논문을 검색하는 중…</p>
  if (error) return <p className="mode-empty">검색에 실패했습니다: {error}</p>
  if (result && (result.status === "failed" || result.status === "cancelled")) {
    return (
      <div className="scholar-search-panel">
        <p className="mode-empty">
          {result.status === "cancelled" ? "검색이 취소되었습니다." : "검색에 실패했습니다."}
        </p>
        <p className="scholar-search-providers">
          {result.providers.map(providerStateLabel).join(" · ")}
        </p>
      </div>
    )
  }
  if (!result || result.results.length === 0)
    return <p className="mode-empty">관련 논문을 찾지 못했습니다.</p>

  return (
    <div className="scholar-search-panel">
      <h3 className="scholar-search-heading">관련 논문</h3>
      <p className="scholar-search-query">“{result.query}”</p>
      {result.status === "partial" ? (
        <p className="scholar-search-providers">
          {result.providers.map(providerStateLabel).join(" · ")}
        </p>
      ) : null}
      <ul className="scholar-search-list">
        {result.results.map((item) => (
          <li
            key={`${item.provider}:${item.identity.providerRecordId}`}
            className="scholar-search-item"
          >
            <a
              href={item.landingUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="scholar-search-title"
            >
              {item.title}
            </a>
            <p className="scholar-search-meta">
              {item.authors.slice(0, 3).join(", ")}
              {item.authors.length > 3 ? " 외" : ""} · {item.year ?? "연도 미상"} ·{" "}
              {item.venue || item.provider}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
