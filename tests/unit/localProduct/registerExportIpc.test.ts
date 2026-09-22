// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { registerExportIpc } from "../../../src/electron/registerExportIpc"
import { exportChannels, exportSaveRequestSchema } from "../../../src/shared/exportIpc"
import { exportBundleSchema } from "../../../src/shared/exportSchemas"

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
    dialog: { showSaveDialog: vi.fn() },
  }
})

vi.mock("electron", () => electron)

const roots: string[] = []

afterEach(async () => {
  electron.handlers.clear()
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const request = exportSaveRequestSchema.parse({
  nodeId: "11111111-1111-4111-8111-111111111111",
  revision: "a".repeat(64),
  format: "markdown",
})
const bundle = exportBundleSchema.parse({
  files: [
    {
      relativePath: "note.md",
      mediaType: "text/markdown",
      bytes: new TextEncoder().encode("exported note"),
    },
  ],
})

function register(): () => void {
  return registerExportIpc({
    preview: async () => ({
      nodeId: request.nodeId,
      title: "Note",
      revision: request.revision,
      recordCount: 1,
      assetCount: 0,
      bibliographyCount: 0,
      sourceCount: 0,
      limitationCount: 0,
    }),
    render: async () => bundle,
  })
}

describe("export IPC file commit", () => {
  it("does not clobber an existing file and leaves no temporary files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-export-ipc-"))
    roots.push(root)
    const target = join(root, "note.md")
    await writeFile(target, "original note")
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    const dispose = register()
    const handler = electron.handlers.get(exportChannels.save)
    if (!handler) throw new Error("Export save handler was not registered")

    await expect(handler({}, request)).rejects.toThrow()
    expect(await readFile(target, "utf8")).toBe("original note")
    expect(await readdir(root)).toEqual(["note.md"])
    dispose()
  })

  it("cancels without creating a destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-export-cancel-"))
    roots.push(root)
    const target = join(root, "note.md")
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: "" })
    const dispose = register()
    const handler = electron.handlers.get(exportChannels.save)
    if (!handler) throw new Error("Export save handler was not registered")

    await expect(handler({}, request)).resolves.toEqual({ saved: false, fileName: null })
    await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(root)).toEqual([])
    dispose()
  })
})
