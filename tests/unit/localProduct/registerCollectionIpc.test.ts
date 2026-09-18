import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { IndexedNote } from "../../../src/electron/collectionIndex"
import {
  collectionRevisionSchema,
  noteIdSchema,
  noteRelativePathSchema,
} from "../../../src/shared/collectionSchemas"

type Handler = (event: unknown, value: unknown) => unknown

const electron = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    ipcMain: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler)
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel)
      },
    },
    dialog: { showOpenDialog: vi.fn() },
    nativeImage: {
      createFromBuffer: vi.fn(() => ({
        getSize: () => ({ width: 1, height: 1 }),
        isEmpty: () => false,
      })),
    },
    shell: { openPath: vi.fn(async () => "") },
    protocol: {},
  }
})

vi.mock("electron", () => electron)

const roots: string[] = []

afterEach(async () => {
  electron.handlers.clear()
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("collection asset IPC", () => {
  it("uses the indexed nested note path and keeps legacy callers readable", async () => {
    // Given
    const { registerCollectionIpc } = await import("../../../src/electron/registerCollectionIpc")
    const { CollectionService } = await import("../../../src/electron/collectionService")
    const { initializeCollection } = await import("../../../src/electron/collectionFiles")
    const { collectionChannels } = await import("../../../src/shared/collectionIpc")
    const root = await mkdtemp(join(tmpdir(), "scourgify-asset-ipc-"))
    roots.push(root)
    await initializeCollection(root, randomUUID())
    const noteId = randomUUID()
    const service = await CollectionService.open(root, join(root, "index.sqlite"))
    const indexed: IndexedNote = {
      noteId: noteIdSchema.parse(noteId),
      relativePath: noteRelativePathSchema.parse("notes/research/renamed.md"),
      revision: collectionRevisionSchema.parse("a".repeat(64)),
      body: "body\n",
      bytes: new Uint8Array(),
    }
    service.rescan = async () => []
    service.index.get = () => indexed
    const dispose = registerCollectionIpc(service, () => {})
    const handler = electron.handlers.get(collectionChannels.assetImport)
    if (!handler) throw new Error("Asset import handler was not registered")
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const hash = createHash("sha256").update(bytes).digest("hex")

    try {
      // When
      const nested = await handler({}, { kind: "bytes", bytes, name: "plot.png", noteId })
      const legacy = await handler({}, { kind: "bytes", bytes, name: "plot.png" })

      // Then
      expect(nested).toMatchObject({
        relativePath: `assets/${hash}.png`,
        markdownSource: `![이미지](../../assets/${hash}.png)`,
      })
      expect(legacy).toMatchObject({
        relativePath: `assets/${hash}.png`,
        markdownSource: `![이미지](assets/${hash}.png)`,
      })
    } finally {
      dispose()
      await service.close()
    }
  })
})
