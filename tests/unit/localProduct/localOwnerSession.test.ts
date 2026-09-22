import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AccountAuthorizationError } from "../../../src/electron/accountSessionTypes"
import {
  createLocalOwnerSession,
  LOCAL_ACCESS_FILE_MAX_BYTES,
  LocalOwnerAccessError,
  LocalOwnerSessionError,
  readLocalOwnerAccess,
} from "../../../src/electron/localOwnerSession"
import { accountIdSchema, accountSessionGrantSchema } from "../../../src/shared/accountSchemas"

const roots: string[] = []
const accountId = accountIdSchema.parse("7efde20f-22e4-4ac8-93e0-b441421589c1")
const otherAccountId = accountIdSchema.parse("fbcd2de7-4ae8-4d93-83cd-e2134e6a2a0a")
const token = `${"a".repeat(22)}.${"b".repeat(22)}.${"c".repeat(22)}`
const grant = accountSessionGrantSchema.parse({
  account: { id: accountId, displayName: null },
  accessToken: token,
  accessExpiresAt: 1,
  renewalToken: `sr_${"r".repeat(43)}`,
  renewalExpiresAt: 1,
  offlineLease: token,
  offlineLeaseExpiresAt: 1,
  offlineLeaseKey: {
    kty: "EC",
    crv: "P-256",
    x: "x".repeat(43),
    y: "y".repeat(43),
    alg: "ES256",
    use: "sig",
    kid: "k".repeat(43),
  },
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-local-owner-"))
  roots.push(root)
  return root
}

describe("local owner access", () => {
  it("leaves the remote flow unselected when the opt-in file is absent", async () => {
    await expect(readLocalOwnerAccess(await temporaryRoot())).resolves.toBeNull()
  })

  it("parses the strict bounded opt-in file", async () => {
    const root = await temporaryRoot()
    await writeFile(
      join(root, "local-access.json"),
      JSON.stringify({ version: 1, mode: "local", accountId }),
    )

    await expect(readLocalOwnerAccess(root)).resolves.toEqual({
      version: 1,
      mode: "local",
      accountId,
    })
  })

  it("fails closed for malformed and oversized opt-in files", async () => {
    const malformedRoot = await temporaryRoot()
    await writeFile(join(malformedRoot, "local-access.json"), '{"version":1,"mode":"local"}')
    await expect(readLocalOwnerAccess(malformedRoot)).rejects.toEqual(
      new LocalOwnerAccessError("malformed"),
    )

    const oversizedRoot = await temporaryRoot()
    await writeFile(
      join(oversizedRoot, "local-access.json"),
      Buffer.alloc(LOCAL_ACCESS_FILE_MAX_BYTES + 1, 0x20),
    )
    await expect(readLocalOwnerAccess(oversizedRoot)).rejects.toEqual(
      new LocalOwnerAccessError("oversized"),
    )
  })

  it("permits protected and matching dirty saves while denying other owners", async () => {
    const changed = vi.fn()
    const session = createLocalOwnerSession(accountId, changed)

    await expect(session.initialize()).resolves.toEqual({ state: "local", accountId })
    await expect(session.refresh("protected_request")).resolves.toEqual({
      state: "local",
      accountId,
    })
    await expect(session.authorize()).resolves.toBeUndefined()
    await expect(session.authorize({ kind: "dirty_save", accountId })).resolves.toBeUndefined()
    await expect(
      session.authorize({ kind: "dirty_save", accountId: otherAccountId }),
    ).rejects.toEqual(new AccountAuthorizationError("locked"))
    expect(changed).toHaveBeenCalledWith({ state: "local", accountId })
  })

  it("rejects remote grant, collection switch, and logout operations", async () => {
    const session = createLocalOwnerSession(accountId)

    await expect(session.acceptGrant(grant)).rejects.toEqual(
      new LocalOwnerSessionError("remote_grant"),
    )
    await expect(session.switchCollection("cancel")).rejects.toEqual(
      new LocalOwnerSessionError("switch_collection"),
    )
    await expect(session.logout()).rejects.toEqual(new LocalOwnerSessionError("logout"))
  })
})
