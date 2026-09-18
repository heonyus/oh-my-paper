import { type FormEvent, type JSX, useEffect, useRef, useState } from "react"
import {
  type DiscoveryApi,
  type DiscoveryJobId,
  type DiscoverySaveResult,
  discoveryJobIdSchema,
} from "../../../shared/discoveryIpc"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import {
  type ParsedScholarlySearchRequest,
  type ScholarlyProvider,
  type ScholarlySearchItem,
  type ScholarlySearchRequest,
  type ScholarlySearchResult,
  scholarlyProviders,
  scholarlySearchRequestSchema,
} from "../../../shared/scholarlySearchSchemas"
import { DiscoveryResults } from "./DiscoveryResults"
import { optionalYear, scholarlyItemKey } from "./discoveryViewModel"
import { SearchForm } from "./SearchForm"
import "./discovery.css"
import "./discovery-results.css"

export interface SearchViewProps {
  readonly discovery: DiscoveryApi
  readonly createJobId?: () => DiscoveryJobId
  readonly onOpenExternal?: ((url: string) => void) | undefined
  readonly onOpenNode?: ((id: KnowledgeNodeId) => void) | undefined
  readonly onOpenGraph?: ((item: ScholarlySearchItem) => void) | undefined
}

type SearchSnapshot = {
  readonly query: string
  readonly fromYear: string
  readonly toYear: string
  readonly providers: readonly ScholarlyProvider[]
  readonly request: ParsedScholarlySearchRequest
  readonly result: ScholarlySearchResult
  readonly selectedItem: ScholarlySearchItem | null
}

function defaultJobId(): DiscoveryJobId {
  return discoveryJobIdSchema.parse(crypto.randomUUID())
}

export function SearchView({
  discovery,
  createJobId = defaultJobId,
  onOpenExternal,
  onOpenNode,
  onOpenGraph,
}: SearchViewProps): JSX.Element {
  const [query, setQuery] = useState("")
  const [fromYear, setFromYear] = useState("")
  const [toYear, setToYear] = useState("")
  const [providers, setProviders] = useState<readonly ScholarlyProvider[]>(scholarlyProviders)
  const [result, setResult] = useState<ScholarlySearchResult | null>(null)
  const [selectedItem, setSelectedItem] = useState<ScholarlySearchItem | null>(null)
  const [savedResults, setSavedResults] = useState<Readonly<Record<string, DiscoverySaveResult>>>(
    {},
  )
  const [history, setHistory] = useState<readonly SearchSnapshot[]>([])
  const [status, setStatus] = useState<"idle" | "searching" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)
  const activeJob = useRef<DiscoveryJobId | null>(null)
  const searchGeneration = useRef(0)
  const lastRequest = useRef<ParsedScholarlySearchRequest | null>(null)
  useEffect(
    () => () => {
      const jobId = activeJob.current
      activeJob.current = null
      if (jobId) void discovery.cancel({ jobId }).catch(() => undefined)
    },
    [discovery],
  )

  function rememberCurrentSearch(): void {
    const request = lastRequest.current
    if (!result || !request) return
    setHistory((current) =>
      [
        ...current,
        {
          query: request.query,
          fromYear: request.filters.fromYear === undefined ? "" : String(request.filters.fromYear),
          toYear: request.filters.toYear === undefined ? "" : String(request.filters.toYear),
          providers: request.providers,
          request,
          result,
          selectedItem,
        },
      ].slice(-10),
    )
  }

  async function runSearch(
    page: number,
    requestOverride?: ScholarlySearchRequest,
    recordHistory = true,
  ): Promise<void> {
    const parsed = scholarlySearchRequestSchema.safeParse(
      requestOverride ?? {
        query,
        providers,
        filters: { fromYear: optionalYear(fromYear), toYear: optionalYear(toYear) },
        page,
        pageSize: 25,
      },
    )
    if (!parsed.success) {
      setMessage("검색어, 제공자, 연도 범위를 확인하세요.")
      return
    }
    const request = parsed.data
    if (recordHistory) rememberCurrentSearch()
    const effectiveRequest = { ...request, page }
    const previousJobId = activeJob.current
    activeJob.current = null
    searchGeneration.current += 1
    if (previousJobId) void discovery.cancel({ jobId: previousJobId }).catch(() => undefined)
    const generation = searchGeneration.current
    const jobId = createJobId()
    activeJob.current = jobId
    lastRequest.current = effectiveRequest
    setStatus("searching")
    setMessage(null)
    try {
      const next = await discovery.search({ jobId, request: effectiveRequest })
      if (activeJob.current !== jobId || searchGeneration.current !== generation) return
      setResult(next)
      setStatus("idle")
    } catch (cause) {
      if (activeJob.current !== jobId || searchGeneration.current !== generation) return
      setStatus("error")
      setMessage(cause instanceof Error ? cause.message : "학술 검색에 실패했습니다.")
    } finally {
      if (activeJob.current === jobId) activeJob.current = null
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void runSearch(1)
  }

  function toggleProvider(provider: ScholarlyProvider): void {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((candidate) => candidate !== provider)
        : [...current, provider],
    )
  }

  function rememberSaved(item: ScholarlySearchItem, saved: DiscoverySaveResult): void {
    setSavedResults((current) => ({ ...current, [scholarlyItemKey(item)]: saved }))
  }

  function goBack(): void {
    const previous = history.at(-1)
    if (!previous) return
    const jobId = activeJob.current
    activeJob.current = null
    if (jobId) void discovery.cancel({ jobId }).catch(() => undefined)
    setHistory((current) => current.slice(0, -1))
    setQuery(previous.query)
    setFromYear(previous.fromYear)
    setToYear(previous.toYear)
    setProviders(previous.providers)
    lastRequest.current = previous.request
    setResult(previous.result)
    setSelectedItem(previous.selectedItem)
    setStatus("idle")
    setMessage(null)
  }

  function searchByTitle(item: ScholarlySearchItem): void {
    const base = lastRequest.current
    setQuery(item.title)
    void runSearch(1, {
      query: item.title,
      providers: base?.providers ?? providers,
      filters: base?.filters ?? { fromYear: optionalYear(fromYear), toYear: optionalYear(toYear) },
      page: 1,
      pageSize: base?.pageSize ?? 25,
    })
  }

  async function cancel(): Promise<void> {
    const jobId = activeJob.current
    if (!jobId) return
    try {
      await discovery.cancel({ jobId })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "검색을 취소하지 못했습니다.")
    }
  }

  return (
    <main className="discovery-view" aria-labelledby="discovery-title">
      <header className="discovery-header">
        <div>
          <p className="discovery-kicker">Academic mode</p>
          <h1 id="discovery-title">학술 검색</h1>
          <p>
            Crossref, arXiv, OpenAlex에서 메타데이터를 검색합니다. 검색은 버튼을 눌렀을 때만
            실행됩니다.
          </p>
        </div>
      </header>
      <SearchForm
        query={query}
        fromYear={fromYear}
        toYear={toYear}
        providers={providers}
        busy={status === "searching"}
        historyLength={history.length}
        onSubmit={submit}
        onQueryChange={setQuery}
        onFromYearChange={setFromYear}
        onToYearChange={setToYear}
        onToggleProvider={toggleProvider}
        onBack={goBack}
        onCancel={() => void cancel()}
      />
      <DiscoveryResults
        result={result}
        status={status}
        message={message}
        lastRequest={lastRequest.current}
        selectedItem={selectedItem}
        savedResults={savedResults}
        saveMetadata={discovery.saveMetadata}
        onRetry={() => {
          if (lastRequest.current) void runSearch(result?.page ?? 1, lastRequest.current, false)
        }}
        onSelectItem={setSelectedItem}
        onCloseDetail={() => setSelectedItem(null)}
        onSave={rememberSaved}
        onSearchByTitle={searchByTitle}
        onOpenGraph={onOpenGraph}
        onOpenExternal={onOpenExternal}
        onOpenNode={onOpenNode}
        onPageChange={(page, request) => void runSearch(page, request)}
      />
    </main>
  )
}
