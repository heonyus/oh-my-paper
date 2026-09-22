import { access, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  AccountServiceRootError,
  accountRemountRequiresReload,
  bindLegacyAccountServiceRoot,
  resolveAccountServiceRoot,
  resolveAccountServiceRootForAccount,
  resolveUnboundServiceRoot,
} from "../../../src/electron/accountServiceRoot"
import { accountIdSchema, accountStatusSchema } from "../../../src/shared/accountSchemas"

const roots: string[] = []
const accountA = accountIdSchema.parse("7efde20f-22e4-4ac8-93e0-b441421589c1")
const accountB = accountIdSchema.parse("fbcd2de7-4ae8-4d93-83cd-e2134e6a2a0a")

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-account-services-"))
  roots.push(root)
  return root
}

describe("account service root", () => {
  it("reloads for an account change even when the collection path is unchanged", () => {
    expect(accountRemountRequiresReload(accountA, accountB, false)).toBe(true)
    expect(accountRemountRequiresReload(accountA, accountA, false)).toBe(false)
    expect(accountRemountRequiresReload(accountA, accountA, true)).toBe(true)
  })

  it("isolates services by the initialized session account", async () => {
    const root = await temporaryRoot()
    const authenticated = accountStatusSchema.parse({
      state: "authenticated",
      account: { id: accountA, displayName: null },
      connection: "offline",
      offlineLeaseExpiresAt: 1_800_604_800,
    })
    const locked = accountStatusSchema.parse({
      state: "locked",
      reason: "expired",
      dirtySaveAccountId: accountB,
    })

    await expect(resolveAccountServiceRoot(root, authenticated)).resolves.toEqual({
      accountId: accountA,
      kind: "isolated",
      root: join(root, "account", "services", accountA),
    })
    await expect(resolveAccountServiceRoot(root, locked)).resolves.toEqual({
      accountId: accountB,
      kind: "isolated",
      root: join(root, "account", "services", accountB),
    })
    await expect(
      resolveAccountServiceRoot(root, accountStatusSchema.parse({ state: "signed_out" })),
    ).resolves.toBeNull()
    await expect(resolveUnboundServiceRoot(root)).resolves.toBe(
      join(root, "account", "services", "unbound"),
    )
    await expect(resolveAccountServiceRootForAccount(root, accountB)).resolves.toMatchObject({
      accountId: accountB,
      kind: "isolated",
    })
  })

  it("reuses the legacy profile root for local access without creating account services", async () => {
    const root = await temporaryRoot()
    const status = accountStatusSchema.parse({ state: "local", accountId: accountA })

    await expect(resolveAccountServiceRoot(root, status)).resolves.toEqual({
      accountId: accountA,
      kind: "local",
      root: join(root, "ohmypaper"),
    })
    await expect(access(join(root, "account"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("uses legacy credentials only after an irreversible owner binding", async () => {
    const root = await temporaryRoot()
    await mkdir(join(root, "ohmypaper"), { recursive: true })
    await expect(resolveAccountServiceRootForAccount(root, accountA)).resolves.toMatchObject({
      kind: "isolated",
    })
    await bindLegacyAccountServiceRoot(root, accountA)

    const statusA = accountStatusSchema.parse({
      state: "authenticated",
      account: { id: accountA, displayName: null },
      connection: "online",
      offlineLeaseExpiresAt: 1_800_604_800,
    })
    const statusB = accountStatusSchema.parse({
      state: "switch_required",
      currentAccountId: accountB,
      nextAccount: { id: accountA, displayName: null },
    })
    await expect(resolveAccountServiceRoot(root, statusA)).resolves.toMatchObject({
      kind: "legacy",
      root: join(root, "ohmypaper"),
    })
    await expect(resolveAccountServiceRoot(root, statusB)).resolves.toMatchObject({
      kind: "isolated",
      accountId: accountB,
    })
    await expect(bindLegacyAccountServiceRoot(root, accountB)).rejects.toEqual(
      new AccountServiceRootError("legacy_owner_conflict"),
    )
  })
})
