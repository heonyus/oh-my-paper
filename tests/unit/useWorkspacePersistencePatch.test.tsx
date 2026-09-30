import { act, renderHook } from "@testing-library/react"
import { useCallback, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WorkspaceUpdate } from "../../src/renderer/lib/useWorkspaceHistory"
import { useWorkspacePersistence } from "../../src/renderer/lib/useWorkspacePersistence"
import {
  documentRecordSchema,
  type Sha256,
  sha256Schema,
  type Workspace,
  workspaceSchema,
} from "../../src/shared/schemas"
import { mergeWorkspaceForSave, WorkspaceConflictError } from "../../src/shared/workspaceMerge"
import {
  applyWorkspacePatch,
  diffWorkspace,
  type WorkspacePatchRequest,
  type WorkspacePatchResult,
} from "../../src/shared/workspacePatch"

const paper = (id: string) =>
  documentRecordSchema.parse({
    id,
    name: `${id}.pdf`,
    hash: id.slice(0, 1).repeat(64),
    bytes: 100,
    importedAt: "2026-09-05T00:00:00.000Z",
    pageCount: 30,
    title: `Paper ${id}`,
    authors: [],
    year: null,
    doi: null,
    overview: "요약 ".repeat(400),
    quality: { textCharacters: 10, needsOcr: false, warnings: [] },
  })
const first = paper("1111111111111111")
const library = workspaceSchema.parse({
  documents: [first, paper("2222222222222222"), paper("3333333333333333")],
  cards: [],
  sidebarOpen: true,
  viewport: { x: 0, y: 0, zoom: 1 },
  activeDocumentId: first.id,
})

/** A loopback server stand-in that remembers acknowledged snapshots until it restarts. */
function fakeBackend(initial: Workspace) {
  let tokens = 0
  let revision = 0
  let committed = initial
  const snapshots = new Map<string, Workspace>()
  const remember = (workspace: Workspace): Workspace => {
    const { baseSnapshotToken: _base, ...content } = workspace
    tokens += 1
    const token: Sha256 = sha256Schema.parse(tokens.toString(16).padStart(64, "0"))
    const snapshot = { ...content, snapshotToken: token }
    snapshots.set(token, snapshot)
    return snapshot
  }
  const commit = (base: Workspace, incoming: Workspace): Workspace => {
    revision += 1
    committed = remember({ ...mergeWorkspaceForSave(base, committed, incoming), revision })
    return committed
  }
  const baseOf = (token: string | undefined): Workspace | undefined =>
    token === undefined ? undefined : snapshots.get(token)
  return {
    readWorkspace: vi.fn(async (): Promise<Workspace> => remember(committed)),
    saveWorkspace: vi.fn(async (workspace: Workspace): Promise<Workspace> => {
      const base = baseOf(workspace.baseSnapshotToken)
      if (!base) throw new WorkspaceConflictError("baseSnapshotToken")
      return commit(base, workspace)
    }),
    saveWorkspacePatch: vi.fn(
      async (request: WorkspacePatchRequest): Promise<WorkspacePatchResult> => {
        const base = baseOf(request.baseSnapshotToken)
        if (!base) return { status: "conflict" }
        const incoming = applyWorkspacePatch(base, request.patch)
        const saved = commit(base, incoming)
        const token = sha256Schema.parse(saved.snapshotToken)
        const patch = diffWorkspace(incoming, saved)
        return { status: "saved", snapshotToken: token, revision: saved.revision, patch }
      },
    ),
    restart: () => snapshots.clear(),
    otherWriter: (edit: (workspace: Workspace) => Workspace) => {
      committed = edit(committed)
    },
  }
}

function useAppState(initial: Workspace) {
  const [workspace, setWorkspace] = useState<Workspace | null>(initial)
  const acknowledge = useCallback((update: WorkspaceUpdate) => {
    setWorkspace((current) => (typeof update === "function" ? update(current) : update))
  }, [])
  const failed = useWorkspacePersistence(workspace, acknowledge)
  return { workspace, setWorkspace, failed }
}

const turnPage = (workspace: Workspace | null, page: number): Workspace | null =>
  workspace && {
    ...workspace,
    documents: workspace.documents.map((document) =>
      document.id === first.id ? { ...document, lastReadPage: page } : document,
    ),
  }

async function settle(): Promise<void> {
  await act(async () => vi.advanceTimersByTimeAsync(250))
}

async function openApp(backend: ReturnType<typeof fakeBackend>, extra: object = {}) {
  Object.defineProperty(window, "ohmypaper", {
    configurable: true,
    value: {
      ...backend,
      onBeforeWorkspaceClose: () => () => {},
      flushWorkspace: async () => {},
      ...extra,
    },
  })
  const hook = renderHook(() => useAppState(library))
  const loaded = await backend.readWorkspace()
  act(() => hook.result.current.setWorkspace(loaded))
  await settle()
  return hook
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("useWorkspacePersistence patch saves", () => {
  it("sends a page turn as one changed field against the acknowledged workspace", async () => {
    const backend = fakeBackend(library)
    const { result } = await openApp(backend)
    expect(backend.saveWorkspace).toHaveBeenCalledTimes(1)
    const acknowledged = result.current.workspace?.snapshotToken

    act(() => result.current.setWorkspace(turnPage(result.current.workspace, 3)))
    await settle()
    act(() => result.current.setWorkspace(turnPage(result.current.workspace, 4)))
    await settle()

    expect(backend.saveWorkspace).toHaveBeenCalledTimes(1)
    expect(backend.saveWorkspacePatch.mock.calls.map(([request]) => request)).toEqual([
      {
        baseSnapshotToken: acknowledged,
        patch: { documents: { changed: [{ key: first.id, set: { lastReadPage: 3 } }] } },
      },
      {
        baseSnapshotToken: expect.not.stringMatching(acknowledged ?? ""),
        patch: { documents: { changed: [{ key: first.id, set: { lastReadPage: 4 } }] } },
      },
    ])
    const fullRequest = JSON.stringify(backend.saveWorkspace.mock.calls[0]?.[0])
    const pageTurnRequest = JSON.stringify(backend.saveWorkspacePatch.mock.calls[1]?.[0])
    expect(pageTurnRequest.length * 20).toBeLessThan(fullRequest.length)
    const client = result.current.workspace
    const server = await backend.readWorkspace()
    if (!client) throw new Error("Expected a workspace")
    expect(diffWorkspace(server, client)).toEqual({})
    expect(client.revision).toBe(server.revision)
    expect(client.documents[0]?.lastReadPage).toBe(4)
    expect(result.current.failed).toBe(false)
  })

  it("recovers from a restarted server with one read and one full save, keeping both edits", async () => {
    const backend = fakeBackend(library)
    const { result } = await openApp(backend)
    backend.restart()
    backend.otherWriter((workspace) => ({ ...workspace, theme: "dark" }))

    act(() => result.current.setWorkspace(turnPage(result.current.workspace, 9)))
    await settle()

    expect(backend.saveWorkspacePatch).toHaveBeenCalledTimes(1)
    expect(backend.readWorkspace).toHaveBeenCalledTimes(2)
    expect(backend.saveWorkspace).toHaveBeenCalledTimes(2)
    expect(result.current.failed).toBe(false)
    expect(result.current.workspace).toMatchObject({ theme: "dark" })
    expect(result.current.workspace?.documents[0]?.lastReadPage).toBe(9)
    expect(backend.saveWorkspace.mock.lastCall?.[0]).toMatchObject({ theme: "dark" })
  })

  it("keeps patching after recovery once the workspace descends from the new acknowledgement", async () => {
    const backend = fakeBackend(library)
    const { result } = await openApp(backend)
    backend.restart()
    act(() => result.current.setWorkspace(turnPage(result.current.workspace, 9)))
    await settle()

    act(() => result.current.setWorkspace(turnPage(result.current.workspace, 10)))
    await settle()

    expect(backend.saveWorkspacePatch).toHaveBeenCalledTimes(2)
    expect(backend.saveWorkspacePatch.mock.lastCall?.[0].patch).toEqual({
      documents: { changed: [{ key: first.id, set: { lastReadPage: 10 } }] },
    })
    expect(backend.saveWorkspace).toHaveBeenCalledTimes(2)
  })

  it("saves in full when a server predates patch saves", async () => {
    const backend = fakeBackend(library)
    const unsupported = vi.fn(
      async (): Promise<WorkspacePatchResult> => ({ status: "unsupported" }),
    )
    const { result } = await openApp(backend, { saveWorkspacePatch: unsupported })

    act(() => result.current.setWorkspace(turnPage(result.current.workspace, 5)))
    await settle()

    expect(unsupported).toHaveBeenCalledTimes(1)
    expect(backend.saveWorkspace).toHaveBeenCalledTimes(2)
    expect(backend.saveWorkspace.mock.lastCall?.[0].documents[0]?.lastReadPage).toBe(5)
    expect(result.current.failed).toBe(false)
  })

  it("saves in full when the workspace was replaced by a fresh read", async () => {
    const backend = fakeBackend(library)
    const { result } = await openApp(backend)
    const fresh = await backend.readWorkspace()

    act(() => result.current.setWorkspace(turnPage(fresh, 6)))
    await settle()

    expect(backend.saveWorkspacePatch).not.toHaveBeenCalled()
    expect(backend.saveWorkspace).toHaveBeenCalledTimes(2)
    expect(backend.saveWorkspace.mock.lastCall?.[0].baseSnapshotToken).toBe(fresh.snapshotToken)
  })
})
