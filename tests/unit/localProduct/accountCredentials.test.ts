import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  AccountCredentialError,
  AccountCredentialStore,
} from "../../../src/electron/accountCredentials"
import { emptyAccountVault } from "../../../src/electron/accountSessionTypes"

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "scourgify-account-test-"))
  roots.push(root)
  return root
}

const cipher = {
  available: async () => true,
  encrypt: async (plaintext: string) => transform(Buffer.from(plaintext, "utf8")),
  decrypt: async (ciphertext: Buffer) => ({
    result: transform(ciphertext).toString("utf8"),
    shouldReEncrypt: false,
  }),
}

function transform(value: Buffer): Buffer {
  return Buffer.from(value.map((byte) => byte ^ 0xaa))
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("account credential store", () => {
  it("round-trips an encrypted vault through actual local storage", async () => {
    const root = await temporaryRoot()
    const store = new AccountCredentialStore(root, cipher)
    const vault = { ...emptyAccountVault(), lastTrustedTime: 1_800_000_000 }

    await store.save(vault)

    expect(await store.load()).toEqual(vault)
    const bytes = await readFile(join(root, "account-credentials.bin"), "utf8")
    expect(bytes).not.toContain('"lastTrustedTime":1800000000')
  })

  it("fails closed when keychain encryption is unavailable", async () => {
    const root = await temporaryRoot()
    const store = new AccountCredentialStore(root, {
      ...cipher,
      available: async () => false,
    })

    await expect(store.save(emptyAccountVault())).rejects.toEqual(
      new AccountCredentialError("keychain_unavailable"),
    )
  })

  it("rejects corrupt ciphertext instead of returning an empty session", async () => {
    const root = await temporaryRoot()
    await writeFile(join(root, "account-credentials.bin"), transform(Buffer.from("not-json")))
    const store = new AccountCredentialStore(root, cipher)

    await expect(store.load()).rejects.toEqual(new AccountCredentialError("credential_corrupt"))
  })
})
