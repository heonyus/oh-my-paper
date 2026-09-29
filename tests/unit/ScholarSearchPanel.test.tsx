import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScholarSearchPanel } from "../../src/renderer/components/ScholarSearchPanel"
import { documentRecordSchema } from "../../src/shared/schemas"
import type { ScholarlySearchResult } from "../../src/shared/scholarlySearchSchemas"

const documentFixture = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "1706050100-upload.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-27T00:00:00.000Z",
  pageCount: 12,
  title: "Attention Is All You Need",
  authors: ["Ashish Vaswani"],
  year: 2017,
  doi: "10.5555/current",
  quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
})

const result = {
  status: "complete",
  query: "Attention Is All You Need",
  page: 1,
  pageSize: 25,
  results: [
    {
      provider: "openalex",
      identity: {
        providerRecordId: "W1",
        doi: null,
        arxivId: null,
        openAlexId: "W1",
      },
      title: "Attention memory study",
      authors: ["Researcher"],
      year: 2024,
      venue: "Journal",
      abstract: "A study of attention and memory.",
      landingUrl: "https://example.org/paper",
      citationCount: 3,
      access: {
        metadata: "available",
        abstract: "available",
        fullText: { state: "unavailable", url: null },
      },
    },
  ],
  providers: [
    {
      provider: "openalex",
      status: "success",
      freshness: "live",
      resultCount: 1,
      totalResults: 1,
      hasMore: false,
    },
  ],
} as const

const providerSteps = [
  { id: "provider-crossref", kind: "provider", provider: "crossref", status: "running" },
  { id: "provider-arxiv", kind: "provider", provider: "arxiv", status: "running" },
  { id: "provider-crossref", kind: "provider", provider: "crossref", status: "done", found: 0 },
  {
    id: "provider-arxiv",
    kind: "provider",
    provider: "arxiv",
    status: "failed",
    detail: "rate_limited",
  },
  { id: "provider-openalex", kind: "provider", provider: "openalex", status: "running" },
  { id: "provider-openalex", kind: "provider", provider: "openalex", status: "done", found: 1 },
  { id: "merge", kind: "merge", status: "done", found: 1 },
] as const

function sseResponse(payload: ScholarlySearchResult): Response {
  const frames = [
    ...providerSteps.map((step) => ({ type: "step", step })),
    { type: "result", result: payload },
  ]
  return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  })
}

describe("ScholarSearchPanel", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("waits for an explicit search and shows a grounded recommendation reason", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse(result))
    vi.stubGlobal("fetch", fetchMock)
    render(<ScholarSearchPanel document={documentFixture} />)

    expect(fetchMock).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "검색 실행" }))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/rpc/scholarlySearchStream")
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      query: "Attention Is All You Need",
    })
    expect(await screen.findByText("Attention memory study")).toBeVisible()
    expect(screen.getByText(/추천 근거: 제목 핵심어 일치/u)).toBeVisible()
  })

  it("keeps the streamed search log so each provider's outcome stays visible", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse(result))
    vi.stubGlobal("fetch", fetchMock)
    render(<ScholarSearchPanel document={documentFixture} />)

    await userEvent.click(screen.getByRole("button", { name: "검색 실행" }))
    await screen.findByText("Attention memory study")

    const log = screen.getByRole("list", { name: "검색 진행 상황" })
    const labels = Array.from(log.querySelectorAll("li")).map((item) => item.textContent)
    expect(labels).toEqual([
      "Crossref 0건",
      "arXiv 실패 · 요청 한도 초과",
      "OpenAlex 1건",
      "출처별 결과 병합 · 후보 1편",
      "관련도 순 정렬 · 1편 통과",
    ])
    expect(screen.getByText("검색 과정")).toBeVisible()
  })

  it("keeps results for a typed query even when they share no words with the open paper", async () => {
    const unrelatedToDocument = {
      ...result,
      results: [
        {
          ...result.results[0],
          identity: { ...result.results[0].identity, providerRecordId: "W2", openAlexId: "W2" },
          title: "Cache-augmented generation without retrieval",
          abstract: "Preload documents into the context.",
        },
      ],
    }
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse(unrelatedToDocument))
    vi.stubGlobal("fetch", fetchMock)
    render(<ScholarSearchPanel document={documentFixture} />)

    const input = screen.getByRole("textbox", { name: "관련 논문 검색어" })
    await userEvent.clear(input)
    await userEvent.type(input, "RAG 대신 캐시 cache augmented")
    expect(screen.getByText("검색어", { exact: false })).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "검색 실행" }))

    expect(await screen.findByText("Cache-augmented generation without retrieval")).toBeVisible()
    expect(screen.getByText(/추천 근거: 검색어 일치: cache, augmented/u)).toBeVisible()
  })

  it("exposes cancellation without converting it into an error", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          )
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(<ScholarSearchPanel document={documentFixture} />)

    await userEvent.click(screen.getByRole("button", { name: "검색 실행" }))
    await userEvent.click(screen.getByRole("button", { name: "논문 검색 취소" }))

    expect(screen.getByRole("status")).toHaveTextContent("검색이 취소되었습니다.")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("saves metadata through the local discovery API", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse(result))
    const saveMetadata = vi.fn(async () => ({ status: "saved", node: {} }))
    vi.stubGlobal("fetch", fetchMock)
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: { discovery: { saveMetadata } },
    })
    render(<ScholarSearchPanel document={documentFixture} />)

    await userEvent.click(screen.getByRole("button", { name: "검색 실행" }))
    await userEvent.click(await screen.findByRole("button", { name: "메타데이터 저장" }))

    expect(saveMetadata).toHaveBeenCalledOnce()
    expect(await screen.findByRole("button", { name: "저장됨" })).toBeVisible()
    Reflect.deleteProperty(window, "ohmypaper")
  })
})
