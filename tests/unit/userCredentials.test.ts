import { describe, expect, it } from "vitest"
import { decryptCredential, encryptCredential } from "../../src/shared/credentialCrypto"

describe("web user credential encryption", () => {
  it("round-trips an API key with randomized AES-GCM ciphertext", async () => {
    const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    const apiKey = "provider-key-that-is-long-enough"

    const first = await encryptCredential(secret, apiKey)
    const second = await encryptCredential(secret, apiKey)

    expect(first).not.toContain(apiKey)
    expect(first).not.toBe(second)
    await expect(decryptCredential(secret, first)).resolves.toBe(apiKey)
    await expect(decryptCredential(secret, second)).resolves.toBe(apiKey)
  })
})
