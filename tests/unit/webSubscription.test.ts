import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CodexSubscriptionAdapter } from "../../src/electron/codexSubscriptionAdapter"
import { WebAiService } from "../../src/server/aiService"
import { aiRequestSchema } from "../../src/shared/ipc"

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

    expect(result).toEqual({ text: "subscription answer", model: "gpt-5.6-sol" })
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
