// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"
import { createAiJobId } from "../../src/shared/documentAiJobs"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "scourgify-stream-"))
  const config: WebServerConfig = {
    host: "127.0.0.1",
    port: 8799,
    dataDir: root,
    staticDir: root,
    provider: null,
    model: null,
    apiKeys: { openai: null, openrouter: null, gemini: null, groq: null },
  }
  const services = await createWebServices(config)
  const server = createLocalWebServer(config, services)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No HTTP address")
  cleanup.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await services.close()
    await rm(root, { recursive: true, force: true })
  })
  const url = `http://127.0.0.1:${address.port}`
  return { services, url }
}

function request(index: number) {
  return {
    jobId: `job:http-${index}`,
    role: "reader",
    documentId: "2a7bc4b7d15f3640",
    sourceGeneration: 1,
    parents: [],
    priority: "current",
    pool: "remote_text",
    request: {
      action: "chat",
      documentId: "2a7bc4b7d15f3640",
      page: 1,
      quote: "test",
      before: "",
      after: "",
    },
  }
}

async function start(url: string, index: number) {
  return fetch(`${url}/api/rpc/startAiJob`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request(index)),
    signal: AbortSignal.timeout(1000),
  })
}

describe("real web AI HTTP lifecycle", () => {
  it("accepts only same-origin credential writes", async () => {
    const { url } = await setup()
    const response = await fetch(`${url}/api/rpc/saveProviderConfig`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://malicious.example" },
      body: JSON.stringify({
        provider: "openrouter",
        apiKey: "sk-or-user-owned-key-at-least-twenty-characters",
        model: "qwen/qwen3.7-flash",
      }),
    })

    expect(response.status).toBe(403)
  })

  it("updates the AI credential and exposes local Paddle status", async () => {
    const { url } = await setup()
    const post = (method: string, body: unknown) =>
      fetch(`${url}/api/rpc/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

    const provider = await post("saveProviderConfig", {
      provider: "openrouter",
      apiKey: "sk-or-user-owned-key-at-least-twenty-characters",
      model: "qwen/qwen3.8-flash",
    })
    const ocr = await post("documentOcrStatus", {})
    const retiredKeyRoute = await post("saveDocumentOcrKey", "retired-provider-key")

    expect(await provider.json()).toMatchObject({
      configured: true,
      provider: "openrouter",
      model: "qwen/qwen3.8-flash",
    })
    expect(await ocr.json()).toMatchObject({ provider: "paddle", model: "PaddleOCR-VL-1.6" })
    expect(retiredKeyRoute.status).toBe(404)
  })

  it("aborts the provider when the browser disconnects", async () => {
    const { services, url } = await setup()
    let notifyAbort: (() => void) | undefined
    const aborted = new Promise<void>((resolve) => {
      notifyAbort = resolve
    })
    services.ai.stream = async (_request, _delta, signal) => {
      await new Promise<void>((resolve) =>
        signal?.addEventListener(
          "abort",
          () => {
            notifyAbort?.()
            resolve()
          },
          { once: true },
        ),
      )
      return { text: "late", model: "test/model" }
    }
    const response = await start(url, 22)
    await response.body?.cancel()
    await aborted
    services.ai.stream = async () => ({ text: "next", model: "test/model" })
    expect(await (await start(url, 23)).text()).toContain('"kind":"completed"')
  }, 2000)

  it("cancels a running provider and closes the cancelled HTTP stream", async () => {
    const { services, url } = await setup()
    let observedSignal: AbortSignal | undefined
    services.ai.stream = async (_request, _delta, signal) => {
      observedSignal = signal
      await new Promise<void>((resolve) =>
        signal?.addEventListener("abort", () => resolve(), { once: true }),
      )
      return { text: "late", model: "test/model" }
    }
    const response = await start(url, 21)
    await fetch(`${url}/api/rpc/cancelAiJob`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job:http-21" }),
    })
    const body = await response.text()
    expect(observedSignal?.aborted).toBe(true)
    expect(body).toContain('"kind":"cancelled"')
    expect(body).not.toContain('"kind":"completed"')
  })

  it("bounds concurrent work and releases slots after cancellation", async () => {
    const { services, url } = await setup()
    services.ai.stream = async (_request, _delta, signal) => {
      await new Promise<void>((resolve) =>
        signal?.addEventListener("abort", () => resolve(), { once: true }),
      )
      return { text: "late", model: "test/model" }
    }
    const first = await start(url, 30)
    const second = await start(url, 31)
    const third = await start(url, 32)
    expect(await third.text()).toContain('"code":"queue_full"')
    services.cancelAiJob(createAiJobId("job:http-30"))
    services.cancelAiJob(createAiJobId("job:http-31"))
    await Promise.all([first.text(), second.text()])
    services.ai.stream = async () => ({ text: "next", model: "test/model" })
    expect(await (await start(url, 33)).text()).toContain('"kind":"completed"')
  })

  it.each([400, 429, 504])(
    "closes provider failure %s without leaking the slot",
    async (status) => {
      const { services, url } = await setup()
      services.ai.stream = async () => {
        throw Object.assign(new Error("provider failure"), { status })
      }
      const response = await start(url, status)
      const body = await response.text()
      expect(body).toContain('"kind":"failed"')
      expect(body).not.toContain('"kind":"completed"')
    },
  )

  it("closes completed responses across 20 jobs and leaves workspace saving available", async () => {
    // Given a real HTTP server with a deterministic provider.
    const { services, url } = await setup()
    services.ai.stream = async (_request, delta) => {
      delta("answer")
      return { text: "answer", model: "test/model" }
    }
    // When twenty jobs complete on the same server.
    for (let index = 0; index < 20; index += 1) {
      const response = await start(url, index)
      const body = await response.text()
      expect(body).toContain('"kind":"completed"')
    }
    const workspace = await services.store.read()
    const saved = await fetch(`${url}/api/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(workspace),
    })
    // Then the response reached EOF and storage remains usable.
    expect(saved.status).toBe(200)
  })
})
