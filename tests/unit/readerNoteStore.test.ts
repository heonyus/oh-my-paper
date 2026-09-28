import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WorkspaceStore } from "../../src/electron/workspaceStore"
import { documentIdSchema } from "../../src/shared/ids"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function store(): Promise<{ readonly root: string; readonly store: WorkspaceStore }> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-reader-note-"))
  roots.push(root)
  return { root, store: new WorkspaceStore(root) }
}

const documentId = documentIdSchema.parse("aabbccddeeff0011")
const note = (markdown: string) => ({
  documentId,
  markdown,
  updatedAt: "2026-09-28T00:00:00.000Z",
})

describe("reader note storage", () => {
  it("writes each note as a Markdown file and reads it back", async () => {
    const { root, store: workspaceStore } = await store()

    await workspaceStore.save({
      ...(await workspaceStore.read()),
      readerNotes: [note("## 문제\n\n내 말로 쓴 문장 [[p.1 | quoted]]")],
    })

    expect(await readFile(join(root, "reader-notes", `${documentId}.md`), "utf8")).toBe(
      "## 문제\n\n내 말로 쓴 문장 [[p.1 | quoted]]",
    )
    expect((await workspaceStore.read()).readerNotes.map((item) => item.markdown)).toEqual([
      "## 문제\n\n내 말로 쓴 문장 [[p.1 | quoted]]",
    ])
    await workspaceStore.close()
  })

  it("keeps a newer note when a stale workspace is saved", async () => {
    const { store: workspaceStore } = await store()
    const stale = await workspaceStore.read()
    await workspaceStore.save({ ...(await workspaceStore.read()), readerNotes: [note("새 노트")] })

    await workspaceStore.save({ ...stale, sidebarOpen: false })

    expect((await workspaceStore.read()).readerNotes.map((item) => item.markdown)).toEqual([
      "새 노트",
    ])
    await workspaceStore.close()
  })
})
