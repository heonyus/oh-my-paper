// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { WebServerConfig } from "../../src/server/config"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-origin-"))
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
  return `http://127.0.0.1:${address.port}`
}

function get(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const req = request(url, { method: "GET", headers }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk: Buffer) => chunks.push(chunk))
      res.on("end", () =>
        resolvePromise({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      )
    })
    req.on("error", reject)
    req.end()
  })
}

describe("cross-origin request guard", () => {
  it("allows top-level navigations triggered from another site", async () => {
    const url = await setup()
    const res = await get(`${url}/`, {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    })
    expect(res.status).not.toBe(403)
    expect(res.headers["x-frame-options"]).toBe("DENY")
  })

  it("rejects cross-site API requests", async () => {
    const url = await setup()
    const res = await get(`${url}/api/documents`, {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
    })
    expect(res.status).toBe(403)
    expect(JSON.parse(res.body)).toMatchObject({ error: "cross_origin_request_rejected" })
  })

  it("rejects cross-site subresource fetches", async () => {
    const url = await setup()
    const res = await get(`${url}/`, {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "cors",
    })
    expect(res.status).toBe(403)
  })

  it("rejects foreign-origin requests", async () => {
    const url = await setup()
    const res = await get(`${url}/api/workspace`, { origin: "http://localhost:9999" })
    expect(res.status).toBe(403)
  })

  it("allows same-origin requests", async () => {
    const url = await setup()
    const res = await get(`${url}/api/workspace`, { origin: url })
    expect(res.status).not.toBe(403)
  })
})
