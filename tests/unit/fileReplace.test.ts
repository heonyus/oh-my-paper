// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { replaceFile } from "../../src/electron/fileReplace"

function codedError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

function flakyRename(failures: readonly string[]): {
  readonly calls: () => number
  readonly renameFile: (from: string, to: string) => Promise<void>
} {
  let calls = 0
  return {
    calls: () => calls,
    renameFile: async () => {
      const code = failures[calls]
      calls += 1
      if (code) throw codedError(code)
    },
  }
}

describe("replaceFile", () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it("replaces the target with the temporary file", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-replace-"))
    roots.push(root)
    await writeFile(join(root, "state.json"), "old")
    await writeFile(join(root, "state.json.tmp"), "new")

    await replaceFile(join(root, "state.json.tmp"), join(root, "state.json"))

    expect(await readFile(join(root, "state.json"), "utf8")).toBe("new")
  })

  it("retries while Windows briefly locks the target", async () => {
    const rename = flakyRename(["EPERM", "EBUSY", "EACCES"])

    await replaceFile("state.json.tmp", "state.json", {
      platform: "win32",
      renameFile: rename.renameFile,
    })

    expect(rename.calls()).toBe(4)
  })

  it("gives up on a lock that does not clear, and on other errors at once", async () => {
    const locked = flakyRename(Array.from({ length: 20 }, () => "EPERM"))
    await expect(
      replaceFile("a.tmp", "a", { platform: "win32", renameFile: locked.renameFile }),
    ).rejects.toMatchObject({ code: "EPERM" })
    expect(locked.calls()).toBe(8)

    const missing = flakyRename(["ENOENT"])
    await expect(
      replaceFile("b.tmp", "b", { platform: "win32", renameFile: missing.renameFile }),
    ).rejects.toMatchObject({ code: "ENOENT" })
    expect(missing.calls()).toBe(1)
  })

  it("does not retry permission errors on other platforms", async () => {
    const rename = flakyRename(["EPERM"])

    await expect(
      replaceFile("c.tmp", "c", { platform: "darwin", renameFile: rename.renameFile }),
    ).rejects.toMatchObject({ code: "EPERM" })
    expect(rename.calls()).toBe(1)
  })
})
