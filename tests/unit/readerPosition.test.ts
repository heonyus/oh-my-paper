import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { defaultWorkspace, WorkspaceStore } from "../../src/electron/workspaceStore"
import { restoreInitialReaderPage } from "../../src/renderer/lib/pdfViewerEventBridge"
import { mostVisiblePage } from "../../src/renderer/lib/viewport"
import { documentRecordSchema } from "../../src/shared/schemas"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("reader position continuity", () => {
  it("chooses the page with the largest visible overlap after a board pan", () => {
    expect(
      mostVisiblePage(60, 640, [
        { page: 1, top: -540, bottom: 260 },
        { page: 2, top: 260, bottom: 1_060 },
      ]),
    ).toBe(2)
  })

  it("publishes the restored page after PDF.js navigation is applied", () => {
    const events: string[] = []
    const viewer = {
      currentPageNumber: 1,
      scrollPageIntoView: ({ pageNumber }: { readonly pageNumber: number }): void => {
        events.push(`scroll:${pageNumber}`)
      },
    }

    restoreInitialReaderPage(viewer, 7, (page) => events.push(`active:${page}`))

    expect(viewer.currentPageNumber).toBe(7)
    expect(events).toEqual(["scroll:7", "active:7"])
  })

  it("keeps each document's saved page across workspace projection", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-reader-position-"))
    temporaryRoots.push(root)
    const first = documentRecordSchema.parse({
      id: "aabbccddeeff0011",
      name: "first.pdf",
      hash: "a".repeat(64),
      bytes: 1024,
      importedAt: "2026-08-30T00:00:00.000Z",
      pageCount: 12,
      title: "First Paper",
      authors: [],
      year: null,
      doi: null,
      lastReadPage: 7,
      quality: { textCharacters: 100, needsOcr: false, warnings: [] },
    })

    const store = new WorkspaceStore(root)
    await store.save({ ...defaultWorkspace(), documents: [first], activeDocumentId: first.id })

    const saved = await store.read()
    expect(saved.documents.find((document) => document.id === first.id)?.lastReadPage).toBe(7)
  })
})
