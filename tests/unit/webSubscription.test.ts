import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { systemPromptFor } from "../../src/electron/aiPrompts"
import { ClaudeSubscriptionAdapter } from "../../src/electron/claudeSubscriptionAdapter"
import { CodexSubscriptionAdapter } from "../../src/electron/codexSubscriptionAdapter"
import { WebAiService } from "../../src/server/aiService"
import { aiRequestSchema } from "../../src/shared/ipc"
import { pageTranslationResponseFormat } from "../../src/shared/pageTranslationProtocol"

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("browser subscription AI service", () => {
  it("passes history and the image separately without copying image bytes into the prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-web-subscription-"))
    roots.push(root)
    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    const completion = vi.spyOn(adapter, "runCompletion").mockResolvedValue("subscription answer")
    const image = "data:image/png;base64,private-image-bytes"
    const request = aiRequestSchema.parse({
      action: "figure",
      documentId: "aabbccddeeff0011",
      page: 3,
      quote: "Figure 2",
      before: "",
      after: "",
      history: [{ role: "user", content: "What does this show?" }],
      imageDataUrl: image,
    })
    const service = new WebAiService(null, adapter)

    const result = await service.run(request)

    expect(result).toEqual({ text: "subscription answer", model: "gpt-6-luna" })
    const params = completion.mock.calls[0]?.[0]
    expect(params?.prompt).toContain("What does this show?")
    expect(params?.prompt).not.toContain("private-image-bytes")
    expect(params?.imageDataUrl).toBe(image)
  })

  it("forwards cancellation and deltas through the subscription adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-web-subscription-"))
    roots.push(root)
    const adapter = new CodexSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    const controller = new AbortController()
    const completion = vi.spyOn(adapter, "runCompletion").mockImplementation(async (params) => {
      params.onDelta?.("partial")
      expect(params.signal).toBe(controller.signal)
      return "complete"
    })
    const service = new WebAiService(null, adapter)
    const deltas: string[] = []
    const request = aiRequestSchema.parse({
      action: "chat",
      documentId: "aabbccddeeff0011",
      page: 3,
      quote: "Question",
      before: "",
      after: "",
    })

    const result = await service.stream(request, (delta) => deltas.push(delta), controller.signal)

    expect(result.text).toBe("complete")
    expect(deltas).toEqual(["partial"])
    expect(completion).toHaveBeenCalledOnce()
  })
})

describe("browser Claude subscription AI service", () => {
  it("sends the action prompt as the system prompt and the image beside the turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-web-claude-"))
    roots.push(root)
    const adapter = new ClaudeSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    const completion = vi.spyOn(adapter, "runCompletion").mockResolvedValue("claude answer")
    const image = "data:image/png;base64,private-image-bytes"
    const request = aiRequestSchema.parse({
      action: "figure",
      documentId: "aabbccddeeff0011",
      page: 3,
      quote: "Figure 2",
      before: "",
      after: "",
      history: [{ role: "user", content: "What does this show?" }],
      imageDataUrl: image,
    })
    const service = new WebAiService(null, null, { mode: "claude" }, adapter)

    const result = await service.run(request)

    expect(result).toEqual({ text: "claude answer", model: "claude-haiku-4-5" })
    const params = completion.mock.calls[0]?.[0]
    expect(params?.systemPrompt).toBe(systemPromptFor("figure"))
    expect(params?.prompt).toContain("What does this show?")
    expect(params?.prompt).not.toContain("private-image-bytes")
    expect(params?.imageDataUrl).toBe(image)
    expect(params?.effort).toBe("medium")
    expect(service.status()).toMatchObject({ provider: "anthropic", mode: "claude" })
  })

  it("enforces the page translation schema that API mode sends as response_format", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-web-claude-"))
    roots.push(root)
    const adapter = new ClaudeSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    const completion = vi
      .spyOn(adapter, "runCompletion")
      .mockResolvedValue('{"translations":[{"id":"b0","markdown":"번역"}]}')
    const service = new WebAiService(null, null, { mode: "claude" }, adapter)
    const base = { documentId: "aabbccddeeff0011", page: 1, before: "", after: "" }

    await service.run(
      aiRequestSchema.parse({
        ...base,
        action: "page_translation",
        quote: JSON.stringify({ blocks: [{ id: "b0", kind: "body", source: "Hello" }] }),
      }),
    )
    await service.run(aiRequestSchema.parse({ ...base, action: "explanation", quote: "Hello" }))

    expect(completion.mock.calls[0]?.[0].jsonSchema).toBe(
      pageTranslationResponseFormat.json_schema.schema,
    )
    expect(completion.mock.calls[1]?.[0].jsonSchema).toBeUndefined()
  })

  it("routes research chat through Claude with the chosen model", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-web-claude-"))
    roots.push(root)
    const adapter = new ClaudeSubscriptionAdapter({
      appRoot: root,
      executablePath: process.execPath,
    })
    const completion = vi.spyOn(adapter, "runCompletion").mockResolvedValue("plan")
    const service = new WebAiService(
      null,
      null,
      { mode: "claude", claudeModel: "claude-opus-5", claudeEffort: "high" },
      adapter,
    )

    const result = await service.chat([
      { role: "system", content: "Plan searches." },
      { role: "user", content: "memory in LLMs" },
    ])

    expect(result).toEqual({ text: "plan", model: "claude-opus-5" })
    expect(completion.mock.calls[0]?.[0]).toMatchObject({
      systemPrompt: "Plan searches.",
      prompt: "memory in LLMs",
      model: "claude-opus-5",
      effort: "high",
    })
  })
})
