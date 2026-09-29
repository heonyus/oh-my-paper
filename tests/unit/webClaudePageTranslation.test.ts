// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ClaudeSubscriptionAdapter } from "../../src/electron/claudeSubscriptionAdapter"
import { WebAiService } from "../../src/server/aiService"
import { aiRequestSchema } from "../../src/shared/ipc"
import { writeFakeClaudeCli } from "../support/fakeClaudeCli"

const adapters: ClaudeSubscriptionAdapter[] = []
const roots: string[] = []
afterEach(async () => {
  for (const adapter of adapters.splice(0)) adapter.dispose()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function claudeService(claudeModel: string): Promise<WebAiService> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-web-claude-page-"))
  roots.push(root)
  const adapter = new ClaudeSubscriptionAdapter({
    appRoot: root,
    executablePath: await writeFakeClaudeCli(root),
  })
  adapters.push(adapter)
  return new WebAiService(
    null,
    null,
    { mode: "claude", claudeModel, claudeEffort: "medium" },
    adapter,
  )
}

const base = { documentId: "aabbccddeeff0011", page: 1, before: "", after: "" }
const blocks = JSON.stringify({ blocks: [{ id: "b0", kind: "body", source: "Hello" }] })

// The fake CLI is a POSIX shebang script, and Claude subscription mode targets macOS.
describe.skipIf(process.platform === "win32")("Claude page translation", () => {
  it.each(["page_translation", "page_structure"] as const)(
    "runs %s without thinking, so a model that thinks at length still answers the page",
    async (action) => {
      const service = await claudeService("fake-slow-thinker")
      const deltas: string[] = []

      const result = await service.stream(
        aiRequestSchema.parse({ ...base, action, quote: blocks }),
        (delta) => deltas.push(delta),
      )

      expect(JSON.parse(result.text)).toEqual({ translations: [{ id: "b0", markdown: "번역" }] })
      expect(deltas.join("")).toBe(result.text)
    },
  )

  it("keeps thinking and the chosen effort for an explanation", async () => {
    const service = await claudeService("fake-echo")

    const result = await service.run(
      aiRequestSchema.parse({ ...base, action: "explanation", quote: "Hello" }),
    )

    const echo: { args: string[]; thinking: boolean } = JSON.parse(result.text)
    expect(echo.thinking).toBe(true)
    expect(echo.args[echo.args.indexOf("--effort") + 1]).toBe("medium")
  })
})
