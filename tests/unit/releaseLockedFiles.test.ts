// @vitest-environment node
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
// @ts-expect-error -- a plain .mjs script without type declarations
import { emptyTrash, releaseLockedFiles } from "../../scripts/release-locked-files.mjs"

type Release = (
  appRoot: string,
  options?: {
    platform?: NodeJS.Platform
    isInUse?: (path: string) => boolean
    move?: (from: string, to: string) => void
    log?: (line: string) => void
  },
) => { moved: string[]; stuck: string[] }

const release = releaseLockedFiles as Release
const empty = emptyTrash as (trash: string) => number

describe("release-locked-files", () => {
  let root = ""

  async function file(path: string): Promise<string> {
    const full = join(root, path)
    await mkdir(join(full, ".."), { recursive: true })
    await writeFile(full, "binary")
    return full
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ohmypaper-release-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("moves the programs and libraries in use out of node_modules on Windows", async () => {
    const esbuild = await file("node_modules/@esbuild/win32-x64/esbuild.exe")
    const addon = await file("node_modules/onnxruntime-node/bin/onnxruntime_binding.node")
    const idle = await file("node_modules/@biomejs/cli-win32-x64/biome.exe")
    const script = await file("node_modules/tsx/dist/cli.mjs")
    const busy = new Set([esbuild, addon, script])

    const { moved, stuck } = release(root, {
      platform: "win32",
      isInUse: (path) => busy.has(path),
    })

    expect(moved.sort()).toEqual([addon, esbuild].sort())
    expect(stuck).toEqual([])
    expect(existsSync(esbuild)).toBe(false)
    expect(existsSync(addon)).toBe(false)
    expect(existsSync(idle)).toBe(true)
    expect(existsSync(script)).toBe(true)
    const trash = await readdir(join(root, ".update-trash"))
    expect(trash.some((name) => name.endsWith("esbuild.exe"))).toBe(true)
    expect(trash.some((name) => name.endsWith("onnxruntime_binding.node"))).toBe(true)
  })

  it("leaves node_modules alone elsewhere, where a file in use can be deleted", async () => {
    const esbuild = await file("node_modules/@esbuild/darwin-arm64/bin/esbuild.exe")

    const { moved } = release(root, { platform: "darwin", isInUse: () => true })

    expect(moved).toEqual([])
    expect(existsSync(esbuild)).toBe(true)
    expect(existsSync(join(root, ".update-trash"))).toBe(false)
  })

  it("empties the trash an earlier update left, once nothing holds it", async () => {
    await file(".update-trash/1-esbuild.exe")

    expect(empty(join(root, ".update-trash"))).toBe(0)
    expect(existsSync(join(root, ".update-trash"))).toBe(false)
  })

  it("does nothing without node_modules", () => {
    expect(release(root, { platform: "win32", isInUse: () => true })).toEqual({
      moved: [],
      stuck: [],
    })
  })

  it("names a file in use that cannot move, so the update stops before npm ci", async () => {
    const codex = await file("node_modules/@openai/codex-win32-x64/vendor/codex.exe")

    const { moved, stuck } = release(root, {
      platform: "win32",
      isInUse: () => true,
      move: () => {
        throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" })
      },
    })

    expect(moved).toEqual([])
    expect(stuck).toEqual([codex])
    expect(existsSync(codex)).toBe(true)
  })
})
