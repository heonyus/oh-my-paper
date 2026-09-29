import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { safeStorage } from "electron"
import { type AccountCredentialVault, accountCredentialVaultSchema } from "../shared/accountSchemas"
import { replaceFile } from "./fileReplace"

export class AccountCredentialError extends Error {
  readonly name = "AccountCredentialError"
  constructor(readonly kind: "keychain_unavailable" | "credential_corrupt") {
    super(kind)
  }
}

export type AccountCredentialPersistence = {
  readonly available: () => Promise<boolean>
  readonly load: () => Promise<AccountCredentialVault | null>
  readonly save: (vault: AccountCredentialVault) => Promise<void>
}

type CredentialCipher = {
  readonly available: () => Promise<boolean>
  readonly encrypt: (plaintext: string) => Promise<Buffer>
  readonly decrypt: (
    ciphertext: Buffer,
  ) => Promise<{ readonly result: string; readonly shouldReEncrypt: boolean }>
}

const electronCipher: CredentialCipher = {
  available: () => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: (plaintext) => safeStorage.encryptStringAsync(plaintext),
  decrypt: (ciphertext) => safeStorage.decryptStringAsync(ciphertext),
}

export class AccountCredentialStore implements AccountCredentialPersistence {
  readonly #file: string

  constructor(
    readonly root: string,
    private readonly cipher: CredentialCipher = electronCipher,
  ) {
    this.#file = join(root, "account-credentials.bin")
  }

  available(): Promise<boolean> {
    return this.cipher.available()
  }

  async load(): Promise<AccountCredentialVault | null> {
    let encrypted: Buffer
    try {
      encrypted = await readFile(this.#file)
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
    if (!(await this.available())) throw new AccountCredentialError("keychain_unavailable")
    try {
      const decrypted = await this.cipher.decrypt(encrypted)
      const vault = accountCredentialVaultSchema.parse(JSON.parse(decrypted.result))
      if (decrypted.shouldReEncrypt) await this.save(vault)
      return vault
    } catch (error) {
      if (error instanceof AccountCredentialError) throw error
      throw new AccountCredentialError("credential_corrupt")
    }
  }

  async save(value: AccountCredentialVault): Promise<void> {
    if (!(await this.available())) throw new AccountCredentialError("keychain_unavailable")
    const vault = accountCredentialVaultSchema.parse(value)
    const encrypted = await this.cipher.encrypt(JSON.stringify(vault))
    await mkdir(this.root, { recursive: true })
    const temporaryFile = `${this.#file}.${crypto.randomUUID()}.tmp`
    try {
      await writeFile(temporaryFile, encrypted, { mode: 0o600, flag: "wx" })
      await replaceFile(temporaryFile, this.#file)
    } catch (error) {
      await rm(temporaryFile, { force: true })
      throw error
    }
  }

  async clear(): Promise<void> {
    await rm(this.#file, { force: true })
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
