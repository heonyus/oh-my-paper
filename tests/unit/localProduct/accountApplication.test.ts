import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AccountAuthorizationError } from "../../../src/electron/accountSessionTypes"
import { createApplicationAccount } from "../../../src/electron/createApplicationAccount"
import { accountIdSchema } from "../../../src/shared/accountSchemas"

afterEach(() => vi.unstubAllEnvs())

const roots: string[] = []
const localAccountId = accountIdSchema.parse("7efde20f-22e4-4ac8-93e0-b441421589c1")

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("application account bootstrap", () => {
  it("returns a fail-closed unavailable session when explicit config is incomplete", async () => {
    vi.stubEnv("OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN", "")
    vi.stubEnv("OH_MY_PAPER_ACCOUNT_ISSUER", "")
    vi.stubEnv("OH_MY_PAPER_GOOGLE_CLIENT_ID", "")
    const onStatusChanged = vi.fn()

    const account = await createApplicationAccount({
      userDataRoot: await uncreatableUserDataRoot(),
      getStore: unavailableStore,
      switchStore: vi.fn(async () => undefined),
      onStatusChanged,
    })

    expect(account.login).toBeNull()
    expect(account.session.status()).toEqual({
      state: "credentials_needed",
      reason: "service_not_configured",
    })
    expect(onStatusChanged).toHaveBeenCalledWith(account.session.status())
    await expect(account.session.authorize()).rejects.toEqual(
      new AccountAuthorizationError("credentials_needed"),
    )
    await expect(account.dispose()).resolves.toBeUndefined()
  })

  it("does not accept malformed HTTP configuration as a local bypass", async () => {
    vi.stubEnv("OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN", "http://127.0.0.1:8789")
    vi.stubEnv("OH_MY_PAPER_ACCOUNT_ISSUER", "http://127.0.0.1:8789")
    vi.stubEnv("OH_MY_PAPER_GOOGLE_CLIENT_ID", "test-client")

    const account = await createApplicationAccount({
      userDataRoot: await uncreatableUserDataRoot(),
      getStore: unavailableStore,
      switchStore: vi.fn(async () => undefined),
      onStatusChanged: vi.fn(),
    })

    expect(account.login).toBeNull()
  })

  it("selects the explicit local profile before remote configuration and preserves ownership metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohmypaper-local-account-"))
    roots.push(root)
    await writeFile(
      join(root, "local-access.json"),
      JSON.stringify({ version: 1, mode: "local", accountId: localAccountId }),
    )
    const ownersPath = join(root, "account", "collection-owners.json")
    const owners = '{"version":1,"bindings":[],"preferred":[]}\n'
    await mkdir(join(root, "account"), { recursive: true })
    await writeFile(ownersPath, owners)

    vi.stubEnv("OH_MY_PAPER_ACCOUNT_SERVICE_ORIGIN", "https://account.example.test")
    vi.stubEnv("OH_MY_PAPER_ACCOUNT_ISSUER", "https://account.example.test")
    vi.stubEnv("OH_MY_PAPER_GOOGLE_CLIENT_ID", "test-client")
    const getStore = vi.fn(() => unavailableStore())
    const switchStore = vi.fn(async () => undefined)

    const account = await createApplicationAccount({
      userDataRoot: root,
      getStore,
      switchStore,
      onStatusChanged: vi.fn(),
    })

    expect(account.login).toBeNull()
    expect(account.session.status()).toEqual({ state: "local", accountId: localAccountId })
    expect(getStore).not.toHaveBeenCalled()
    expect(switchStore).not.toHaveBeenCalled()
    await expect(readFile(ownersPath, "utf8")).resolves.toBe(owners)
    await expect(account.dispose()).resolves.toBeUndefined()
  })
})

function unavailableStore(): never {
  throw new Error("unavailable account bootstrap must not read the store")
}

/**
 * A user data folder no one can read or create, root included, on every system: a link (a
 * junction on Windows) to a folder that does not exist, so no local profile can be made in it.
 * A folder inside a regular file would not do: there macOS and Linux fail the profile read with
 * ENOTDIR, which bootstrap reports as an unreadable profile instead of falling back.
 */
async function uncreatableUserDataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-"))
  roots.push(root)
  const userDataRoot = join(root, "user-data")
  await symlink(join(root, "missing"), userDataRoot, "junction")
  return userDataRoot
}
