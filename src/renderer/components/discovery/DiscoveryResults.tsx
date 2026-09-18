import type { JSX } from "react"
import type { DiscoveryApi, DiscoverySaveResult } from "../../../shared/discoveryIpc"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type {
  ParsedScholarlySearchRequest,
  ScholarlySearchItem,
  ScholarlySearchResult,
} from "../../../shared/scholarlySearchSchemas"
import { ArticleDetailPanel } from "./ArticleDetailPanel"
import { providerErrorSummary, scholarlyItemKey } from "./discoveryViewModel"
import { SearchResultCard } from "./SearchResultCard"

export interface DiscoveryResultsProps {
  readonly result: ScholarlySearchResult | null
  readonly status: "idle" | "searching" | "error"
  readonly message: string | null
  readonly lastRequest: ParsedScholarlySearchRequest | null
  readonly selectedItem: ScholarlySearchItem | null
  readonly savedResults: Readonly<Record<string, DiscoverySaveResult>>
  readonly saveMetadata: DiscoveryApi["saveMetadata"]
  readonly onRetry: () => void
  readonly onSelectItem: (item: ScholarlySearchItem) => void
  readonly onCloseDetail: () => void
  readonly onSave: (item: ScholarlySearchItem, result: DiscoverySaveResult) => void
  readonly onSearchByTitle: (item: ScholarlySearchItem) => void
  readonly onOpenGraph?: ((item: ScholarlySearchItem) => void) | undefined
  readonly onOpenExternal?: ((url: string) => void) | undefined
  readonly onOpenNode?: ((id: KnowledgeNodeId) => void) | undefined
  readonly onPageChange: (page: number, request: ParsedScholarlySearchRequest) => void
}

export function DiscoveryResults({
  result,
  status,
  message,
  lastRequest,
  selectedItem,
  savedResults,
  saveMetadata,
  onRetry,
  onSelectItem,
  onCloseDetail,
  onSave,
  onSearchByTitle,
  onOpenGraph,
  onOpenExternal,
  onOpenNode,
  onPageChange,
}: DiscoveryResultsProps): JSX.Element {
  const errors = result ? providerErrorSummary(result) : null
  const hasMore = result?.providers.some(
    (provider) => provider.status === "success" && provider.hasMore,
  )
  const selectedKey = selectedItem ? scholarlyItemKey(selectedItem) : null

  return (
    <div className="discovery-content">
      <section className="discovery-results" aria-live="polite" aria-busy={status === "searching"}>
        {status === "searching" ? (
          <p className="discovery-status">제공자 응답을 기다리는 중…</p>
        ) : null}
        {message ? (
          <p className="discovery-error" role="alert">
            {message}
          </p>
        ) : null}
        {errors ? (
          <div className="discovery-provider-errors" role="status">
            <p>일부 제공자를 사용할 수 없습니다: {errors}</p>
            <button className="discovery-button" type="button" onClick={onRetry}>
              다시 시도
            </button>
          </div>
        ) : null}
        {result && status !== "searching" ? (
          <>
            <div className="discovery-results-summary">
              <strong>{result.results.length}개 결과</strong>
              <span>
                “{result.query}” · {result.status}
              </span>
            </div>
            {result.results.length === 0 ? (
              <p className="discovery-empty">이 페이지에 표시할 결과가 없습니다.</p>
            ) : null}
            {result.results.map((item) => (
              <SearchResultCard
                key={scholarlyItemKey(item)}
                item={item}
                selected={selectedKey === scholarlyItemKey(item)}
                saveMetadata={saveMetadata}
                onSaved={(saved: DiscoverySaveResult) => onSave(item, saved)}
                onSelect={() => onSelectItem(item)}
                onOpenExternal={onOpenExternal}
              />
            ))}
            <nav className="discovery-pagination" aria-label="검색 결과 페이지">
              <button
                className="discovery-button"
                type="button"
                disabled={result.page <= 1 || !lastRequest}
                onClick={() => lastRequest && onPageChange(result.page - 1, lastRequest)}
              >
                이전
              </button>
              <span>{result.page} / 100</span>
              <button
                className="discovery-button"
                type="button"
                disabled={!hasMore || result.page >= 100 || !lastRequest}
                onClick={() => lastRequest && onPageChange(result.page + 1, lastRequest)}
              >
                다음
              </button>
            </nav>
          </>
        ) : null}
      </section>
      {selectedItem ? (
        <ArticleDetailPanel
          key={selectedKey}
          item={selectedItem}
          saveMetadata={saveMetadata}
          {...(selectedKey && savedResults[selectedKey]
            ? { savedResult: savedResults[selectedKey] }
            : {})}
          onSaved={(saved: DiscoverySaveResult) => onSave(selectedItem, saved)}
          onSearchByTitle={onSearchByTitle}
          {...(onOpenGraph ? { onOpenGraph: () => onOpenGraph(selectedItem) } : {})}
          onOpenExternal={onOpenExternal}
          onOpenNode={onOpenNode}
          onClose={onCloseDetail}
        />
      ) : null}
    </div>
  )
}
