// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DocumentAnalysisStateStore,
  MAX_PERSISTED_ANALYSIS_IDS,
} from "../../src/electron/documentAnalysisStateStore"
import * as fileReplace from "../../src/electron/fileReplace"
import { type DocumentId, documentIdSchema } from "../../src/shared/schemas"

vi.mock("../../src/electron/fileReplace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/electron/fileReplace")>()
  return { ...actual, replaceFile: vi.fn(actual.replaceFile) }
})

const ids = (count: number, offset = 0): readonly DocumentId[] =>
  Array.from({ length: count }, (_, index) =>
    documentIdSchema.parse((index + offset).toString(16).padStart(16, "0")),
  )

let root = ""
let file = ""
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "document-analysis-state-"))
  file = join(root, "document-analysis-queue.json")
  vi.mocked(fileReplace.replaceFile).mockClear()
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("DocumentAnalysisStateStore", () => {
  it("loads v1, v2 and v3 files holding more than 64 ids", async () => {
    const store = new DocumentAnalysisStateStore(root, "parser-v3")
    const many = ids(70)

    await writeFile(file, JSON.stringify({ version: 1, documentIds: many }))
    expect(await store.load()).toEqual({ pendingIds: many, readyIds: [] })
    await writeFile(file, JSON.stringify({ version: 2, pendingIds: many, readyIds: many }))
    expect(await store.load()).toEqual({ pendingIds: many, readyIds: [] })
    const v3 = { version: 3, parserVersion: "parser-v3", pendingIds: [], readyIds: many }
    await writeFile(file, JSON.stringify(v3))
    expect(await store.load()).toEqual({ pendingIds: [], readyIds: many })
  })

  it("writes a library beyond the bound as its first ids instead of failing", async () => {
    const store = new DocumentAnalysisStateStore(root, "parser-v3")
    const readyIds = ids(MAX_PERSISTED_ANALYSIS_IDS + 1)

    await store.save({ pendingIds: [], readyIds })

    const loaded = await store.load()
    expect(loaded.readyIds).toHaveLength(MAX_PERSISTED_ANALYSIS_IDS)
    expect(loaded.readyIds.at(-1)).toBe(readyIds[MAX_PERSISTED_ANALYSIS_IDS - 1])
  })

  it("coalesces a burst of saves into the newest state", async () => {
    const store = new DocumentAnalysisStateStore(root, "parser-v3")
    const states = Array.from({ length: 50 }, (_, index) => ({
      pendingIds: ids(index + 1),
      readyIds: ids(1, 100 + index),
    }))

    await Promise.all(states.map((state) => store.save(state)))

    expect(vi.mocked(fileReplace.replaceFile).mock.calls.length).toBeLessThanOrEqual(2)
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      version: 3,
      parserVersion: "parser-v3",
      ...states.at(-1),
    })
  })

  it("rejects a failed write without blocking the next one", async () => {
    const store = new DocumentAnalysisStateStore(root, "parser-v3")
    vi.mocked(fileReplace.replaceFile).mockRejectedValueOnce(new Error("disk full"))

    await expect(store.save({ pendingIds: ids(1), readyIds: [] })).rejects.toThrow("disk full")
    await store.save({ pendingIds: [], readyIds: ids(2) })

    expect(await store.load()).toEqual({ pendingIds: [], readyIds: ids(2) })
  })
})
