import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AiRequest } from "../../src/shared/ipc"
import { documentIdSchema } from "../../src/shared/schemas"

const openAiMocks = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}))

vi.mock("openai", () => ({
  default: class MockOpenAI {
    readonly chat = { completions: { create: openAiMocks.create } }
  },
}))

import { ProviderService } from "../../src/electron/providerService"

type FinishReason = "stop" | "length" | null
type StreamPart = {
  readonly text?: string
  readonly finishReason: FinishReason
}

const roots: string[] = []
const request: AiRequest = {
  action: "section",
  documentId: documentIdSchema.parse("aabbccddeeff0011"),
  page: 2,
  quote: "1 INTRODUCTION",
  before: "",
  after: "",
}

async function* completionStream(parts: readonly StreamPart[]) {
  for (const part of parts) {
    yield {
      model: "z-ai/glm-5.3-flash:nitro",
      choices: [
        {
          delta: part.text ? { content: part.text } : {},
          finish_reason: part.finishReason,
        },
      ],
    }
  }
}

async function service(): Promise<ProviderService> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-provider-stream-"))
  roots.push(root)
  const provider = new ProviderService(root)
  await provider.saveConfig({
    provider: "openrouter",
    apiKey: "sk-or-stream-test-key-at-least-twenty-characters",
    model: "z-ai/glm-5.3-flash",
  })
  return provider
}

afterEach(async () => {
  openAiMocks.create.mockReset()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("ProviderService streamed completion", () => {
  it("continues a section response that ends because of the output limit", async () => {
    openAiMocks.create
      .mockResolvedValueOnce(
        completionStream([
          { text: "첫 문장입니다. 이어지는", finishReason: null },
          { finishReason: "length" },
        ]),
      )
      .mockResolvedValueOnce(
        completionStream([
          { text: " 완결 문장입니다.", finishReason: null },
          { finishReason: "stop" },
        ]),
      )
    const deltas: string[] = []

    const result = await (await service()).runStream(request, (delta) => deltas.push(delta))

    expect(result.text).toBe("첫 문장입니다. 이어지는 완결 문장입니다.")
    expect(deltas.join("")).toBe(result.text)
    expect(openAiMocks.create).toHaveBeenCalledTimes(2)
  })

  it("rejects partial text when a stream ends without a terminal reason", async () => {
    openAiMocks.create.mockResolvedValueOnce(
      completionStream([{ text: "완결되지 않은 응답", finishReason: null }]),
    )

    await expect((await service()).runStream(request, vi.fn())).rejects.toMatchObject({
      kind: "request_failed",
    })
  })

  it("continues a non-streamed response that reaches the output limit", async () => {
    openAiMocks.create
      .mockResolvedValueOnce({
        model: "z-ai/glm-5.3-flash:nitro",
        choices: [{ message: { content: "제한에 닿은 응답" }, finish_reason: "length" }],
      })
      .mockResolvedValueOnce({
        model: "z-ai/glm-5.3-flash:nitro",
        choices: [{ message: { content: "의 완결입니다." }, finish_reason: "stop" }],
      })

    const result = await (await service()).run(request)

    expect(result.text).toBe("제한에 닿은 응답의 완결입니다.")
    expect(openAiMocks.create).toHaveBeenCalledTimes(2)
  })

  it("rejects instead of storing partial prose after the bounded continuation rounds", async () => {
    for (const text of ["첫 부분", "둘째 부분", "셋째 부분"]) {
      openAiMocks.create.mockResolvedValueOnce(
        completionStream([{ text, finishReason: null }, { finishReason: "length" }]),
      )
    }

    await expect((await service()).runStream(request, vi.fn())).rejects.toMatchObject({
      kind: "request_failed",
    })
    expect(openAiMocks.create).toHaveBeenCalledTimes(3)
  })
})
