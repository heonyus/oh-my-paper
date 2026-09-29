// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { WebServerConfig } from "../../src/server/config"
import { saveGithubStarAnswer } from "../../src/server/githubStarStore"
import { createLocalWebServer } from "../../src/server/server"
import { createWebServices } from "../../src/server/services"
import { githubStarStatusSchema } from "../../src/shared/githubStar"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-star-route-"))
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
  const status = async () => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/rpc/githubStarStatus`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    return githubStarStatusSchema.parse(await response.json())
  }
  return { root, status }
}

describe("githubStarStatus route", () => {
  it("reports the wizard's saved answer so the app can stay quiet after it", async () => {
    const { root, status } = await setup()
    expect(await status()).toEqual({ answer: null })

    await saveGithubStarAnswer(root, "opened")
    expect(await status()).toEqual({ answer: "opened" })
  })
})
