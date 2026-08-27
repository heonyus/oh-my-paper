import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("WorkspaceStore", () => {
  it("migrates legacy source anchors without deleting saved cards", async () => {
    const root = await mkdtemp(join(tmpdir(), "hotebook-workspace-"))
    temporaryRoots.push(root)
    const legacy = {
      documents: [],
      cards: [
        {
          id: "f7ac31b5-19f6-4bec-b30a-3cf8692f9d82",
          documentId: "aabbccddeeff0011",
          kind: "note",
          title: "기존 주석",
          body: "보존되어야 합니다.",
          x: 900,
          y: 240,
          minimized: false,
          anchor: { page: 1, quote: "legacy quote", x: 420, y: 180 },
        },
      ],
      sidebarOpen: true,
      viewport: { x: 0, y: 0, zoom: 1.5 },
      activeDocumentId: null,
    }
    await writeFile(join(root, "workspace.json"), JSON.stringify(legacy), "utf8")

    const workspace = await new WorkspaceStore(root).read()

    expect(workspace.cards).toHaveLength(1)
    expect(workspace.cards[0]?.anchor.fragments).toEqual([{ x: 420, y: 180, width: 1, height: 1 }])
  })

  it("serializes rapid workspace saves without losing the newest state", async () => {
    const root = await mkdtemp(join(tmpdir(), "hotebook-workspace-"))
    temporaryRoots.push(root)
    const store = new WorkspaceStore(root)
    const workspace = defaultWorkspace()

    await Promise.all([
      store.save({ ...workspace, viewport: { ...workspace.viewport, zoom: 0.5 } }),
      store.save({ ...workspace, viewport: { ...workspace.viewport, zoom: 0.8 } }),
      store.save({ ...workspace, viewport: { ...workspace.viewport, zoom: 1.25 } }),
    ])

    expect((await store.read()).viewport.zoom).toBe(1.25)
  })
})
