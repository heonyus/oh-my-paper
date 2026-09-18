import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SearchView } from "../../../src/renderer/components/discovery/SearchView"
import type { DiscoveryApi } from "../../../src/shared/discoveryIpc"
import { discoveryJobIdSchema, discoverySaveResultSchema } from "../../../src/shared/discoveryIpc"
import {
  scholarlySearchItemSchema,
  scholarlySearchResultSchema,
} from "../../../src/shared/scholarlySearchSchemas"

const jobId = discoveryJobIdSchema.parse("123e4567-e89b-42d3-a456-426614174010")
const item = scholarlySearchItemSchema.parse({
  provider: "crossref",
  identity: {
    providerRecordId: "10.1000/view",
    doi: "10.1000/view",
    arxivId: null,
    openAlexId: null,
  },
  title: "A synthetic academic result",
  authors: ["Test Author"],
  year: 2024,
  venue: "Synthetic Journal",
  abstract: "A short abstract used only in this test.",
  landingUrl: "https://doi.org/10.1000/view",
  citationCount: 9,
  access: {
    metadata: "available",
    abstract: "available",
    fullText: { state: "unavailable", url: null },
  },
})

function client(overrides: Partial<DiscoveryApi> = {}): DiscoveryApi {
  return {
    search: vi.fn(async (input) =>
      scholarlySearchResultSchema.parse({
        status: "partial",
        query: input.request.query,
        page: input.request.page ?? 1,
        pageSize: input.request.pageSize ?? 25,
        results: [item],
        providers: [
          {
            provider: "crossref",
            status: "success",
            freshness: "live",
            resultCount: 1,
            totalResults: 101,
            hasMore: true,
          },
          {
            provider: "openalex",
            status: "error",
            error: { kind: "rate_limited", httpStatus: 429, retryAfterSeconds: 30 },
          },
        ],
      }),
    ),
    cancel: vi.fn(async () => ({ cancelled: true })),
    saveMetadata: vi.fn(async () =>
      discoverySaveResultSchema.parse({
        status: "saved",
        node: {
          id: "123e4567-e89b-42d3-a456-426614174011",
          kind: "paper",
          title: item.title,
          body: "",
          aliases: ["doi:10.1000/view"],
          metadata: { fullTextReviewed: false },
          createdAt: "2026-09-06T00:00:00.000Z",
          updatedAt: "2026-09-06T00:00:00.000Z",
        },
      }),
    ),
    ...overrides,
  }
}

describe("SearchView", () => {
  it("searches only after the explicit action and carries filters into paging", async () => {
    const discovery = client()
    render(<SearchView discovery={discovery} createJobId={() => jobId} />)
    expect(discovery.search).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "clinical agents" } })
    fireEvent.change(screen.getByLabelText("시작 연도"), { target: { value: "2020" } })
    fireEvent.click(screen.getByRole("button", { name: "검색" }))

    expect(await screen.findByText(item.title)).toBeVisible()
    expect(discovery.search).toHaveBeenCalledWith({
      jobId,
      request: expect.objectContaining({
        query: "clinical agents",
        page: 1,
        filters: { fromYear: 2020, toYear: undefined },
      }),
    })
    expect(screen.getByText(/openalex: rate_limited \(30초 후 재시도\)/)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "다음" }))
    await waitFor(() => expect(discovery.search).toHaveBeenCalledTimes(2))
    expect(discovery.search).toHaveBeenLastCalledWith({
      jobId,
      request: expect.objectContaining({ page: 2 }),
    })
  })

  it("saves metadata on the explicit library action", async () => {
    const discovery = client()
    render(<SearchView discovery={discovery} createJobId={() => jobId} />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "metadata" } })
    fireEvent.click(screen.getByRole("button", { name: "검색" }))
    await screen.findByText(item.title)

    fireEvent.click(screen.getByRole("button", { name: "라이브러리에 저장" }))
    expect(await screen.findByText("메타데이터를 지식 라이브러리에 저장했습니다.")).toBeVisible()
    expect(discovery.saveMetadata).toHaveBeenCalledWith({ item })
  })

  it("offers cancellation for an active search", async () => {
    const search = vi.fn(() => new Promise<never>(() => undefined))
    const discovery = client({ search })
    render(<SearchView discovery={discovery} createJobId={() => jobId} />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cancel me" } })
    fireEvent.click(screen.getByRole("button", { name: "검색" }))
    fireEvent.click(await screen.findByRole("button", { name: "취소" }))
    await waitFor(() => expect(discovery.cancel).toHaveBeenCalledWith({ jobId }))
  })

  it("keeps the result list in place while exploring a selected paper", async () => {
    const discovery = client()
    render(<SearchView discovery={discovery} createJobId={() => jobId} />)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "seed" } })
    fireEvent.click(screen.getByRole("button", { name: "검색" }))
    await screen.findByText(item.title)

    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }))
    const detail = screen.getByRole("complementary", { name: "선택한 논문 상세" })
    expect(within(detail).getByText(item.title)).toBeVisible()
    expect(screen.getByRole("button", { name: "참고문헌 목록" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "피인용 논문 목록" })).toBeDisabled()

    fireEvent.click(within(detail).getByRole("button", { name: "이 제목으로 더 검색" }))
    await waitFor(() => expect(discovery.search).toHaveBeenCalledTimes(2))
    expect(discovery.search).toHaveBeenLastCalledWith({
      jobId,
      request: expect.objectContaining({ query: item.title, page: 1 }),
    })
    expect(screen.getByText(/1개 결과/)).toBeVisible()
  })

  it("opens the real source and saved knowledge record from the inspector", async () => {
    const onOpenExternal = vi.fn()
    const onOpenNode = vi.fn()
    const discovery = client()
    render(
      <SearchView
        discovery={discovery}
        createJobId={() => jobId}
        onOpenExternal={onOpenExternal}
        onOpenNode={onOpenNode}
      />,
    )
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "open" } })
    fireEvent.click(screen.getByRole("button", { name: "검색" }))
    await screen.findByText(item.title)
    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }))
    const detail = screen.getByRole("complementary", { name: "선택한 논문 상세" })

    fireEvent.click(within(detail).getByRole("button", { name: "원문 열기" }))
    expect(onOpenExternal).toHaveBeenCalledWith(item.landingUrl)
    fireEvent.click(within(detail).getByRole("button", { name: "라이브러리에 저장" }))
    await within(detail).findByText("지식 라이브러리에 저장했습니다.")
    fireEvent.click(within(detail).getByRole("button", { name: "지식·노트 열기" }))
    expect(onOpenNode).toHaveBeenCalledWith("123e4567-e89b-42d3-a456-426614174011")
  })

  it("restores the previous query, results, and selection without fetching again", async () => {
    const secondItem = scholarlySearchItemSchema.parse({ ...item, title: "A second result" })
    const base = client()
    const search = vi.fn(async (input: Parameters<DiscoveryApi["search"]>[0]) => {
      const response = await base.search(input)
      return scholarlySearchResultSchema.parse({
        ...response,
        results: input.request.query === "first" ? [item] : [secondItem],
      })
    })
    const discovery = client({ search })
    render(<SearchView discovery={discovery} createJobId={() => jobId} />)

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "first" } })
    fireEvent.click(screen.getByRole("button", { name: "검색" }))
    await screen.findByText(item.title)
    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }))
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "second" } })
    fireEvent.click(screen.getByRole("button", { name: "검색" }))
    await screen.findByText(secondItem.title)

    fireEvent.click(screen.getByRole("button", { name: "이전 검색 (1/10)" }))
    expect(search).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("searchbox")).toHaveValue("first")
    expect(screen.getByText(/“first”/)).toBeVisible()
    expect(screen.getByRole("complementary", { name: "선택한 논문 상세" })).toHaveTextContent(
      item.title,
    )
  })

  it("cancels a deferred search when a newer request supersedes it", async () => {
    type SearchResult = Awaited<ReturnType<DiscoveryApi["search"]>>
    let resolveFirst: ((result: SearchResult) => void) | undefined
    let firstInput: Parameters<DiscoveryApi["search"]>[0] | null = null
    const pendingFirst = new Promise<SearchResult>((resolve) => {
      resolveFirst = resolve
    })
    const base = client()
    const search = vi.fn((input: Parameters<DiscoveryApi["search"]>[0]) => {
      if (input.request.query === "first") {
        firstInput = input
        return pendingFirst
      }
      return base.search(input)
    })
    const discovery = client({ search })
    render(<SearchView discovery={discovery} createJobId={() => jobId} />)
    const form = screen.getByRole("searchbox").closest("form")
    if (!form) throw new Error("search form missing")

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "first" } })
    fireEvent.submit(form)
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "second" } })
    fireEvent.submit(form)

    await waitFor(() => expect(discovery.cancel).toHaveBeenCalledWith({ jobId }))
    await screen.findByText(item.title)
    if (firstInput) resolveFirst?.(await base.search(firstInput))
  })
})
