import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ScholarlyGraphView } from "../../../src/renderer/components/discovery/ScholarlyGraphView"
import type { DiscoveryApi } from "../../../src/shared/discoveryIpc"
import { discoverySaveResultSchema } from "../../../src/shared/discoveryIpc"
import type { ScholarlyGraphApi } from "../../../src/shared/scholarlyGraphIpc"
import { scholarlyGraphResultSchema } from "../../../src/shared/scholarlyGraphSchemas"
import { scholarlySearchItemSchema } from "../../../src/shared/scholarlySearchSchemas"

const seed = scholarlySearchItemSchema.parse({
  provider: "openalex",
  identity: { providerRecordId: "A", doi: null, arxivId: null, openAlexId: "A" },
  title: "Seed paper",
  authors: ["Seed Author"],
  year: 2024,
  venue: "",
  abstract: null,
  landingUrl: "https://openalex.org/A",
  citationCount: 3,
  access: {
    metadata: "available",
    abstract: "unavailable",
    fullText: { state: "link_only", url: "https://openalex.org/A" },
  },
})
const graph = scholarlyGraphResultSchema.parse({
  status: "complete",
  provider: "openalex",
  seedIds: ["https://openalex.org/A"],
  nodes: [
    {
      id: "https://openalex.org/A",
      provider: "openalex",
      title: "Seed paper",
      authors: ["Seed Author"],
      year: 2024,
      citationCount: 3,
      doi: null,
      sourceUrl: "https://openalex.org/A",
      abstract: null,
    },
    {
      id: "https://openalex.org/B",
      provider: "openalex",
      title: "Referenced paper",
      authors: ["Other Author"],
      year: 2020,
      citationCount: 8,
      doi: null,
      sourceUrl: "https://openalex.org/B",
      abstract: null,
    },
  ],
  edges: [
    {
      sourceId: "https://openalex.org/A",
      targetId: "https://openalex.org/B",
      direction: "references",
      provenance: "openalex",
    },
  ],
  directions: [
    {
      direction: "references",
      status: "success",
      resultCount: 1,
      totalResults: 1,
      truncated: false,
      error: null,
    },
  ],
  truncated: false,
})
const expandedGraph = scholarlyGraphResultSchema.parse({
  ...graph,
  nodes: [
    ...graph.nodes,
    {
      id: "https://openalex.org/C",
      provider: "openalex",
      title: "Expanded paper",
      authors: ["Third Author"],
      year: 2019,
      citationCount: 2,
      doi: null,
      sourceUrl: "https://openalex.org/C",
      abstract: null,
    },
  ],
  edges: [
    ...graph.edges,
    {
      sourceId: "https://openalex.org/A",
      targetId: "https://openalex.org/C",
      direction: "references",
      provenance: "openalex",
    },
  ],
})

const discovery: DiscoveryApi = {
  search: vi.fn(),
  cancel: vi.fn(async () => ({ cancelled: true })),
  saveMetadata: vi.fn(async () =>
    discoverySaveResultSchema.parse({
      status: "saved",
      node: {
        id: "123e4567-e89b-42d3-a456-426614174011",
        kind: "paper",
        title: seed.title,
        body: "",
        aliases: [],
        metadata: {},
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
    }),
  ),
}

describe("ScholarlyGraphView", () => {
  it("cancels a pending graph request when the view becomes hidden", async () => {
    const pending = new Promise<never>(() => undefined)
    const cancel = vi.fn(async (_input: Parameters<ScholarlyGraphApi["cancel"]>[0]) => ({
      cancelled: true,
    }))
    const get = vi.fn<ScholarlyGraphApi["get"]>(async () => pending)
    const api: ScholarlyGraphApi = { get, cancel }
    const rendered = render(
      <ScholarlyGraphView
        api={api}
        discovery={discovery}
        seed={seed}
        active
        onClose={() => undefined}
      />,
    )
    await waitFor(() => expect(get).toHaveBeenCalled())
    const renderedInput = get.mock.calls[0]?.[0]
    if (!renderedInput) throw new Error("graph request was not recorded")
    rendered.rerender(
      <ScholarlyGraphView
        api={api}
        discovery={discovery}
        seed={seed}
        active={false}
        onClose={() => undefined}
      />,
    )
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ jobId: renderedInput.jobId }))
  })

  it("restores the previous graph snapshot after an explicit expansion", async () => {
    const api: ScholarlyGraphApi = {
      get: vi.fn().mockResolvedValueOnce(graph).mockResolvedValueOnce(expandedGraph),
      cancel: vi.fn(async () => ({ cancelled: true })),
    }
    render(
      <ScholarlyGraphView api={api} discovery={discovery} seed={seed} onClose={() => undefined} />,
    )
    await screen.findByRole("complementary", { name: "선택한 논문 상세" })
    fireEvent.click(screen.getByRole("button", { name: "참고문헌" }))
    await screen.findByText("Expanded paper")
    fireEvent.click(screen.getByRole("button", { name: "이전" }))
    await waitFor(() => expect(screen.queryByText("Expanded paper")).toBeNull())
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it("cancels an expansion when hidden and ignores its late result after returning", async () => {
    let resolvePending: ((value: typeof graph) => void) | undefined
    const pending = new Promise<typeof graph>((resolve) => {
      resolvePending = resolve
    })
    const get = vi
      .fn<ScholarlyGraphApi["get"]>()
      .mockResolvedValueOnce(graph)
      .mockReturnValueOnce(pending)
    const cancel = vi.fn(async () => ({ cancelled: true }))
    const api: ScholarlyGraphApi = { get, cancel }
    const rendered = render(
      <ScholarlyGraphView
        api={api}
        discovery={discovery}
        seed={seed}
        active
        onClose={() => undefined}
      />,
    )
    await screen.findByRole("complementary", { name: "선택한 논문 상세" })
    fireEvent.click(screen.getByRole("button", { name: "참고문헌" }))
    await screen.findByText("관계 데이터를 불러오는 중…")
    rendered.rerender(
      <ScholarlyGraphView
        api={api}
        discovery={discovery}
        seed={seed}
        active={false}
        onClose={() => undefined}
      />,
    )
    expect(cancel).toHaveBeenCalled()
    rendered.rerender(
      <ScholarlyGraphView
        api={api}
        discovery={discovery}
        seed={seed}
        active
        onClose={() => undefined}
      />,
    )
    expect(screen.queryByText("관계 데이터를 불러오는 중…")).toBeNull()
    await act(async () => {
      resolvePending?.(expandedGraph)
      await pending
    })
    expect(screen.queryByText("Expanded paper")).toBeNull()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("keeps forward history when inspecting a paper after going back", async () => {
    const get = vi
      .fn<ScholarlyGraphApi["get"]>()
      .mockResolvedValueOnce(graph)
      .mockResolvedValueOnce(expandedGraph)
    const api: ScholarlyGraphApi = { get, cancel: vi.fn(async () => ({ cancelled: true })) }
    render(
      <ScholarlyGraphView api={api} discovery={discovery} seed={seed} onClose={() => undefined} />,
    )
    await screen.findByRole("complementary", { name: "선택한 논문 상세" })
    fireEvent.click(screen.getByRole("button", { name: "참고문헌" }))
    await screen.findByText("Expanded paper")
    fireEvent.click(screen.getByRole("button", { name: "이전" }))
    fireEvent.click(screen.getByRole("button", { name: "Referenced paper, 2020" }))
    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "다음" }))
    await screen.findByText("Expanded paper")
    expect(get).toHaveBeenCalledTimes(2)
  })
})
