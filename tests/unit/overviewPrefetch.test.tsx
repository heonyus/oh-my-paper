import { act, renderHook, waitFor } from "@testing-library/react"
import { useCallback, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { overviewRequestKey, overviewRequests } from "../../src/renderer/lib/paperOverview"
import { useOverviewPrefetch } from "../../src/renderer/lib/useOverviewPrefetch"
import type { WorkspaceSetter, WorkspaceUpdate } from "../../src/renderer/lib/useWorkspaceHistory"
import type { AiRequest, ProviderStatus } from "../../src/shared/ipc"
import { documentRecordSchema, type Workspace, workspaceSchema } from "../../src/shared/schemas"

function paper(id: string, importedAt: string) {
  return documentRecordSchema.parse({
    id,
    name: `${id}.pdf`,
    hash: id.padEnd(64, "0"),
    bytes: 1024,
    importedAt,
    pageCount: 12,
    title: `Paper ${id}`,
    authors: ["Researcher"],
    year: 2026,
    doi: null,
    overview: "Page 1: an abstract.",
    quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
  })
}

const oldPaper = paper("aaaaaaaaaaaaaaaa", "2026-08-01T00:00:00.000Z")
const newPaper = paper("bbbbbbbbbbbbbbbb", "2026-09-30T08:00:00.000Z")
const ready: ProviderStatus = {
  configured: true,
  provider: "anthropic",
  model: "claude-haiku-4-5",
  mode: "claude",
  claudeModel: "claude-haiku-4-5",
}

function library(documents: readonly ReturnType<typeof paper>[]): Workspace {
  return workspaceSchema.parse({
    documents,
    cards: [],
    sidebarOpen: true,
    viewport: { x: 0, y: 0, zoom: 1 },
    activeDocumentId: null,
  })
}

function useHarness(initial: Workspace, provider: ProviderStatus) {
  const [workspace, setState] = useState<Workspace | null>(initial)
  const setWorkspace: WorkspaceSetter = useCallback(
    (update: WorkspaceUpdate) =>
      setState((current) => (typeof update === "function" ? update(current) : update)),
    [],
  )
  useOverviewPrefetch(workspace, provider, setWorkspace)
  return { workspace, setWorkspace }
}

function stubApi(runAi: (request: AiRequest) => Promise<{ text: string; model: string }>) {
  vi.stubGlobal("ohmypaper", {
    readDocumentAst: vi.fn(async () => ({ status: "failed", reason: "source_unavailable" })),
    runAi: vi.fn(runAi),
  })
  return window.ohmypaper.runAi as unknown as ReturnType<typeof vi.fn>
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  overviewRequests.clear()
})

describe("overview prefetch", () => {
  it("writes a newly imported paper's overview without waiting for it to open", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-30T09:00:00.000Z") })
    const runAi = stubApi(async (request) => ({ text: `${request.action} 답`, model: "m" }))
    const { result } = renderHook(() => useHarness(library([oldPaper]), ready))
    // A paper already in the library is left to the AI 개요 panel.
    expect(runAi).not.toHaveBeenCalled()

    act(() =>
      result.current.setWorkspace((current) =>
        current ? { ...current, documents: [...current.documents, newPaper] } : current,
      ),
    )

    await waitFor(() => expect(result.current.workspace?.insights).toHaveLength(3))
    expect(runAi.mock.calls.map(([request]) => request.action).sort()).toEqual([
      "keywords",
      "paper_summary",
      "three_line_summary",
    ])
    expect(runAi.mock.calls.every(([request]) => request.documentId === newPaper.id)).toBe(true)
    expect(
      result.current.workspace?.insights.map((insight) => [insight.kind, insight.value]).sort(),
    ).toEqual([
      ["keywords", "keywords 답"],
      ["summary", "paper_summary 답"],
      ["threeLines", "three_line_summary 답"],
    ])
  })

  it("counts a paper imported just before the app opened, once AI is connected", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-30T08:05:00.000Z") })
    const runAi = stubApi(async () => ({ text: "답", model: "m" }))
    const { rerender } = renderHook(
      ({ provider }) => useHarness(library([oldPaper, newPaper]), provider),
      { initialProps: { provider: { ...ready, configured: false } } },
    )
    expect(runAi).not.toHaveBeenCalled()

    rerender({ provider: ready })

    await waitFor(() => expect(runAi).toHaveBeenCalledTimes(3))
    expect(runAi.mock.calls.every(([request]) => request.documentId === newPaper.id)).toBe(true)
  })

  it("joins an answer the panel is already writing instead of asking again", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-30T08:05:00.000Z") })
    const runAi = stubApi(async (request) => ({ text: `${request.action} 답`, model: "m" }))
    overviewRequests.set(overviewRequestKey(newPaper.id, "summary"), Promise.resolve("패널의 요약"))
    const { result } = renderHook(() => useHarness(library([newPaper]), ready))

    await waitFor(() => expect(result.current.workspace?.insights).toHaveLength(3))
    expect(runAi).toHaveBeenCalledTimes(2)
    expect(
      result.current.workspace?.insights.find((insight) => insight.kind === "summary")?.value,
    ).toBe("패널의 요약")
  })
})
