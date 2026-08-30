import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => {
      const decrypted = value.toString("utf8")
      if (decrypted === "unreadable") throw new Error("decrypt failed")
      return decrypted
    },
  },
}))

import { ProviderService } from "../../src/electron/providerService"

const temporaryRoots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("ProviderService environment bootstrap", () => {
  it("encrypts the first environment configuration for later app launches", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-provider-"))
    temporaryRoots.push(root)
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-example-key-at-least-twenty-characters")
    const service = new ProviderService(root)

    expect(await service.status()).toMatchObject({
      configured: true,
      provider: "openrouter",
      model: "z-ai/glm-5.3-flash",
    })

    vi.unstubAllEnvs()
    expect(await new ProviderService(root).status()).toMatchObject({ configured: true })
    expect((await readFile(join(root, "provider-config.bin"))).length).toBeGreaterThan(0)
  })

  it("replaces a stale encrypted configuration with the explicit environment", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-provider-"))
    temporaryRoots.push(root)
    const service = new ProviderService(root)
    await service.saveConfig({
      provider: "openrouter",
      apiKey: "sk-or-stale-key-at-least-twenty-characters",
      model: "deepseek/deepseek-v4-flash-0731",
    })
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-current-key-at-least-twenty-characters")

    expect(await service.status()).toMatchObject({
      configured: true,
      provider: "openrouter",
      model: "z-ai/glm-5.3-flash",
    })

    vi.unstubAllEnvs()
    expect(await new ProviderService(root).status()).toMatchObject({
      configured: true,
      model: "z-ai/glm-5.3-flash",
    })
  })

  it("recovers an unreadable encrypted configuration from the explicit environment", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-provider-"))
    temporaryRoots.push(root)
    await writeFile(join(root, "provider-config.bin"), "unreadable", "utf8")
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-current-key-at-least-twenty-characters")

    expect(await new ProviderService(root).status()).toMatchObject({
      configured: true,
      provider: "openrouter",
      model: "z-ai/glm-5.3-flash",
    })

    vi.unstubAllEnvs()
    expect(await new ProviderService(root).status()).toMatchObject({ configured: true })
  })
})
