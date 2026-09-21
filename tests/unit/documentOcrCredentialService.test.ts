// @vitest-environment node

import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}))

import { DocumentOcrCredentialService } from "../../src/electron/documentOcrCredentialService"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("DocumentOcrCredentialService", () => {
  it("ignores inherited Mistral environment keys by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-ocr-key-"))
    roots.push(root)
    vi.stubEnv("MISTRAL_API_KEY", "mistral-inherited-key-at-least-twenty-characters")
    const service = new DocumentOcrCredentialService(root)

    expect(await service.status()).toEqual({
      configured: false,
      provider: "mistral",
      model: "mistral-ocr-4-1",
    })
    expect(await service.apiKey()).toBeNull()
  })

  it("accepts an explicitly injected fixture key without persisting it", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-ocr-key-"))
    roots.push(root)
    const service = new DocumentOcrCredentialService(root, {
      MISTRAL_API_KEY: "mistral-fixture-key-at-least-twenty-characters",
    })

    expect(await service.apiKey()).toBe("mistral-fixture-key-at-least-twenty-characters")
    expect(await service.status()).toMatchObject({ configured: true, provider: "mistral" })
    await expect(access(join(root, "mistral-ocr-key.bin"))).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("encrypts a key saved from the settings boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-ocr-key-"))
    roots.push(root)
    const service = new DocumentOcrCredentialService(root, {})

    await service.saveKey("mistral-saved-key-at-least-twenty-characters")

    expect(await service.apiKey()).toBe("mistral-saved-key-at-least-twenty-characters")
    expect(await service.status()).toMatchObject({ configured: true, provider: "mistral" })
  })
})
