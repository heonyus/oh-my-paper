// @vitest-environment node

import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { build } from "esbuild"
import { afterEach, describe, expect, it } from "vitest"

const executeFile = promisify(execFile)
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("packaged PDF preparation", () => {
  it("keeps PDF.js outside the CommonJS Electron main bundle", async () => {
    await executeFile(process.execPath, [join(process.cwd(), "scripts", "build-electron.mjs")], {
      cwd: process.cwd(),
    })
    const mainBundle = await readFile(
      join(process.cwd(), "dist-electron", "electron", "main.js"),
      "utf8",
    )

    expect(mainBundle).not.toContain("SCALE_MATRIX = new DOMMatrix")
    expect(mainBundle).toContain('import("pdfjs-dist/legacy/build/pdf.mjs")')
  })

  it("loads PDF.js as ESM from a CommonJS Electron main bundle", async () => {
    const root = await mkdtemp(join(process.cwd(), ".packaged-pdf-"))
    temporaryRoots.push(root)
    const bundlePath = join(root, "prepare-smoke.cjs")
    await build({
      stdin: {
        contents: [
          'import { readFile } from "node:fs/promises"',
          'import { preparePdf } from "./src/electron/preparePdf.ts"',
          "void (async () => {",
          "  const bytes = await readFile(process.argv[2] ?? '')",
          "  const result = await preparePdf(new Uint8Array(bytes), 'sample-paper.pdf')",
          "  process.stdout.write(JSON.stringify({ pages: result.pageCount }))",
          "})()",
        ].join("\n"),
        resolveDir: process.cwd(),
        sourcefile: "prepare-smoke.ts",
        loader: "ts",
      },
      outfile: bundlePath,
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      external: ["pdfjs-dist/legacy/build/pdf.mjs"],
    })

    const fixture = join(process.cwd(), "tests", "fixtures", "sample-paper.pdf")
    const { stdout } = await executeFile(process.execPath, [bundlePath, fixture], {
      cwd: process.cwd(),
    })

    expect(JSON.parse(stdout)).toEqual({ pages: 3 })
  })
})
