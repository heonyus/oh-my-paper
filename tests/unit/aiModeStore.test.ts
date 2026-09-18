import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AiModeStore } from "../../src/electron/aiModeStore"

describe("AiModeStore", () => {
  it("defaults to subscription access and preserves an explicit API choice", async () => {
    const root = await mkdtemp(join(tmpdir(), "hotebook-ai-mode-"))
    const store = new AiModeStore(root)

    await expect(store.load()).resolves.toBe("chatgpt")
    await store.save("api")
    await expect(store.load()).resolves.toBe("api")
    await expect(readFile(join(root, "ai-mode.json"), "utf8")).resolves.toContain("api")
  })
})
