import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  forgetOwnSummary,
  readOwnSummaries,
  writeOwnSummaries,
} from "../../src/electron/ownSummariesFile"
import { WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema } from "../../src/shared/ids"
import { mergeOwnSummaries, type OwnSummary } from "../../src/shared/ownSummary"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-own-summary-"))
  temporaryRoots.push(root)
  return root
}

const first = documentIdSchema.parse("aabbccddeeff0011")
const second = documentIdSchema.parse("aabbccddeeff0022")

function summary(documentId = first, problem = "기억이 줄어든다"): OwnSummary {
  return {
    documentId,
    status: "submitted",
    afterReveal: false,
    lines: { problem, method: "", result: "" },
    updatedAt: "2026-09-28T00:00:00.000Z",
  }
}

describe("mergeOwnSummaries", () => {
  it("takes a record the incoming side changed", () => {
    const revised = summary(first, "고친 문제")
    expect(mergeOwnSummaries([summary()], [summary()], [revised])).toEqual([revised])
  })

  it("keeps newer lines when a stale writer resends the base", () => {
    const newer = summary(first, "새로 쓴 문제")
    expect(mergeOwnSummaries([summary()], [newer], [summary()])).toEqual([newer])
  })

  it("deletes only a record the current side left untouched", () => {
    const newer = summary(second, "다른 논문")
    expect(mergeOwnSummaries([summary(), summary(second)], [summary(), newer], [])).toEqual([newer])
  })
})

describe("own summary storage", () => {
  it("saves the reader's lines beside the database and reads them back", async () => {
    const store = new WorkspaceStore(await temporaryRoot())
    const workspace = await store.read()

    const saved = await store.save({ ...workspace, ownSummaries: [summary()] })

    expect(saved.ownSummaries).toEqual([summary()])
    expect((await store.read()).ownSummaries).toEqual([summary()])
    await store.close()
  })

  it("does not drop lines when a stale workspace is saved later", async () => {
    const store = new WorkspaceStore(await temporaryRoot())
    const stale = await store.read()
    await store.save({ ...(await store.read()), ownSummaries: [summary()] })

    await store.save({ ...stale, sidebarOpen: false })

    expect((await store.read()).ownSummaries).toEqual([summary()])
    await store.close()
  })

  it("moves an unreadable file aside instead of overwriting it", async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, "own-summaries.json"), "{not json", "utf8")

    expect(await readOwnSummaries(root)).toEqual([])
    expect(
      (await readdir(root)).some((name) => name.startsWith("own-summaries.json.unreadable-")),
    ).toBe(true)
  })

  it("forgets only the deleted document's summary", async () => {
    const root = await temporaryRoot()
    await writeOwnSummaries(root, [summary(), summary(second, "남는다")])

    await forgetOwnSummary(root, first)

    expect(await readOwnSummaries(root)).toEqual([summary(second, "남는다")])
  })
})
