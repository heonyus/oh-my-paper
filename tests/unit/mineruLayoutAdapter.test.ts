// @vitest-environment node

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { mineruRuntimeCommand, runMineruLayout } from "../../src/electron/mineruLayoutAdapter"

describe("MinerU layout adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("resolves a dedicated managed runtime", () => {
    expect(mineruRuntimeCommand("/Users/test", "darwin")).toBe(
      join("/Users/test", ".ohmypaper", "mineru-runtime", "bin", "mineru"),
    )
    expect(mineruRuntimeCommand("C:\\Users\\test", "win32")).toBe(
      join("C:\\Users\\test", ".ohmypaper", "mineru-runtime", "Scripts", "mineru.exe"),
    )
  })

  // The fake runtime is a POSIX shebang script, which Windows cannot start directly.
  it.skipIf(process.platform === "win32")(
    "runs MinerU offline and parses its content list",
    async () => {
      // Given
      const root = await mkdtemp(join(tmpdir(), "mineru-adapter-test-"))
      const command = join(root, "fake-mineru")
      const pdfPath = join(root, "paper.pdf")
      const sourceHash = "d".repeat(64)
      await writeFile(pdfPath, "%PDF-fixture", "utf8")
      await writeFile(
        command,
        [
          "#!/usr/bin/env node",
          'const fs = require("node:fs")',
          'const path = require("node:path")',
          'const output = process.argv[process.argv.indexOf("-o") + 1]',
          'if (process.env.HF_HUB_OFFLINE !== "1" || process.env.TRANSFORMERS_OFFLINE !== "1") process.exit(4)',
          'if (["OPENAI_API_KEY", "OAUTH_ACCESS_TOKEN", "HTTPS_PROXY", "CODEX_AUTH_TOKEN"].some((key) => process.env[key] === "canary-secret")) process.exit(5)',
          'const target = path.join(output, "paper", "auto")',
          "fs.mkdirSync(target, { recursive: true })",
          'fs.writeFileSync(path.join(target, "paper_content_list.json"), JSON.stringify([{type:"text",text:"Parsed paragraph.",bbox:[100,100,900,200],page_idx:0}]))',
        ].join("\n"),
        "utf8",
      )
      await chmod(command, 0o755)

      try {
        vi.stubEnv("OPENAI_API_KEY", "canary-secret")
        vi.stubEnv("OAUTH_ACCESS_TOKEN", "canary-secret")
        vi.stubEnv("HTTPS_PROXY", "canary-secret")
        vi.stubEnv("CODEX_AUTH_TOKEN", "canary-secret")

        // When
        const result = await runMineruLayout({ command, pdfPath, sourceHash })

        // Then
        expect(result.status).toBe("ready")
        if (result.status !== "ready") return
        expect(result.layout.pages[0]?.boxes[0]).toMatchObject({
          label: "text",
          content: "Parsed paragraph.",
        })
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it("returns an unavailable result without a configured runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "mineru-adapter-missing-"))
    try {
      const result = await runMineruLayout({
        command: join(root, "missing-mineru"),
        pdfPath: join(root, "paper.pdf"),
        sourceHash: "e".repeat(64),
      })
      expect(result).toEqual({ status: "unavailable", reason: "runtime_missing" })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
