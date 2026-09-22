import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { AccountJwtError } from "../../../src/electron/accountJwt"
import { AccountSession } from "../../../src/electron/accountSession"
import { AccountAuthorizationError } from "../../../src/electron/accountSessionTypes"
import type { AccountTransport } from "../../../src/electron/accountTransport"
import {
  type AccountCredentialVault,
  type AccountSessionGrant,
  accountCredentialVaultSchema,
  accountIdSchema,
  accountSessionGrantSchema,
  accountSessionIdSchema,
  offlineLeaseKeySchema,
} from "../../../src/shared/accountSchemas"

const issuer = "https://account.example.test"
const now = 1_800_000_000
const accountId = accountIdSchema.parse("7efde20f-22e4-4ac8-93e0-b441421589c1")
const otherAccountId = accountIdSchema.parse("fbcd2de7-4ae8-4d93-83cd-e2134e6a2a0a")
const sessionId = accountSessionIdSchema.parse("32951f92-4b19-4e24-9df0-55bbef20a07c")
const jwkCoordinatesSchema = z.object({ x: z.string(), y: z.string() })

async function grantFixture(
  options: { readonly accessAudience?: string; readonly mutateLeaseSignature?: boolean } = {},
): Promise<AccountSessionGrant> {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])
  const coordinates = jwkCoordinatesSchema.parse(
    await crypto.subtle.exportKey("jwk", keys.publicKey),
  )
  const canonical = JSON.stringify({ crv: "P-256", kty: "EC", x: coordinates.x, y: coordinates.y })
  const kid = Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(canonical))).toString(
    "base64url",
  )
  const key = offlineLeaseKeySchema.parse({
    kty: "EC",
    crv: "P-256",
    x: coordinates.x,
    y: coordinates.y,
    alg: "ES256",
    use: "sig",
    kid,
  })
  const common = {
    iss: issuer,
    sub: accountId,
    sid: sessionId,
    iat: now,
  }
  const accessToken = await signJwt(keys.privateKey, key.kid, {
    ...common,
    aud: options.accessAudience ?? "scourgify-account-api",
    purpose: "account-api",
    jti: "access-token-id-0001",
    exp: now + 900,
  })
  const lease = await signJwt(keys.privateKey, key.kid, {
    ...common,
    aud: "ohmypaper-desktop-offline",
    purpose: "ohmypaper-local-access",
    jti: "offline-lease-id-001",
    exp: now + 604_800,
    verified_at: now,
    renewal_expires_at: now + 2_592_000,
  })
  const offlineLease = options.mutateLeaseSignature ? mutateSignatureByte(lease) : lease
  return accountSessionGrantSchema.parse({
    account: { id: accountId, displayName: "Researcher" },
    accessToken,
    accessExpiresAt: now + 900,
    renewalToken: `sr_${"r".repeat(43)}`,
    renewalExpiresAt: now + 2_592_000,
    offlineLease,
    offlineLeaseExpiresAt: now + 604_800,
    offlineLeaseKey: key,
  })
}

function mutateSignatureByte(token: string): string {
  const segments = token.split(".")
  const encodedSignature = segments[2]
  if (!encodedSignature) throw new Error("JWT signature is missing")
  const signature = Buffer.from(encodedSignature, "base64url")
  const firstByte = signature.at(0)
  if (firstByte === undefined) throw new Error("JWT signature is empty")
  signature[0] = firstByte ^ 1
  return `${segments[0]}.${segments[1]}.${signature.toString("base64url")}`
}

async function signJwt(key: CryptoKey, kid: string, claims: Readonly<Record<string, unknown>>) {
  const header = encodeJson({ alg: "ES256", typ: "JWT", kid })
  const payload = encodeJson(claims)
  const input = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(input),
  )
  return `${input}.${Buffer.from(signature).toString("base64url")}`
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function sessionHarness(
  vault: AccountCredentialVault,
  clock: () => number = () => now,
  currentAccount: typeof accountId | null = accountId,
  onStatusChanged?: ReturnType<typeof vi.fn>,
  prepareAuthenticatedAccount?: ReturnType<typeof vi.fn>,
) {
  let persisted = vault
  const credentials = {
    available: async () => true,
    load: async () => persisted,
    save: async (next: AccountCredentialVault) => {
      persisted = accountCredentialVaultSchema.parse(next)
    },
  }
  const unused = async (): Promise<never> => {
    throw new Error("unused transport")
  }
  const transport: AccountTransport = {
    challenge: unused,
    exchange: unused,
    renew: unused,
    account: unused,
    logout: async () => undefined,
  }
  const bindUnownedToAccount = vi.fn(async () => undefined)
  const openForAccount = vi.fn(async () => undefined)
  const session = new AccountSession({
    credentials,
    transport,
    issuer,
    clock,
    collectionSwitch: {
      currentAccountId: async () => currentAccount,
      bindUnownedToAccount,
      openForAccount,
    },
    ...(onStatusChanged ? { onStatusChanged } : {}),
    ...(prepareAuthenticatedAccount ? { prepareAuthenticatedAccount } : {}),
  })
  return { bindUnownedToAccount, session }
}

describe("desktop account session", () => {
  it("restores a signed seven-day lease and permits protected calls", async () => {
    const grant = await grantFixture()
    const { session } = sessionHarness({
      version: 1,
      active: grant,
      lastTrustedTime: now,
      revokedSessionIds: [],
    })

    await expect(session.initialize()).resolves.toMatchObject({
      state: "authenticated",
      connection: "offline",
    })
    await expect(session.authorize()).resolves.toBeUndefined()
  })

  it("fails closed for a bad audience or modified lease", async () => {
    const badAudience = await grantFixture({ accessAudience: "other-audience" })
    const badLease = await grantFixture({ mutateLeaseSignature: true })

    for (const grant of [badAudience, badLease]) {
      const { session } = sessionHarness({
        version: 1,
        active: grant,
        lastTrustedTime: now,
        revokedSessionIds: [],
      })
      await expect(session.initialize()).resolves.toEqual({
        state: "credentials_needed",
        reason: "credential_corrupt",
      })
      await expect(session.authorize()).rejects.toEqual(
        new AccountAuthorizationError("credentials_needed"),
      )
    }
  })

  it("denies expired, rolled-back, and known-revoked sessions", async () => {
    const grant = await grantFixture()
    const cases = [
      { clock: () => now + 604_801, lastTrustedTime: now, revokedSessionIds: [] },
      { clock: () => now, lastTrustedTime: now + 301, revokedSessionIds: [] },
      { clock: () => now, lastTrustedTime: now, revokedSessionIds: [sessionId] },
    ]
    for (const current of cases) {
      const { session } = sessionHarness({ version: 1, active: grant, ...current }, current.clock)
      await expect(session.initialize()).resolves.toMatchObject({ state: "locked" })
      await expect(session.authorize()).rejects.toEqual(new AccountAuthorizationError("locked"))
    }
  })

  it("allows dirty-save grace only for the previously unlocked account", async () => {
    const grant = await grantFixture()
    const { session } = sessionHarness(
      { version: 1, active: grant, lastTrustedTime: now, revokedSessionIds: [] },
      () => now + 604_801,
    )
    await session.initialize()

    await expect(session.authorize({ kind: "dirty_save", accountId })).resolves.toBeUndefined()
    await expect(
      session.authorize({ kind: "dirty_save", accountId: otherAccountId }),
    ).rejects.toEqual(new AccountAuthorizationError("locked"))
  })

  it("binds an unowned collection and blocks a mismatched collection on restore", async () => {
    const grant = await grantFixture()
    const vault = accountCredentialVaultSchema.parse({
      version: 1,
      active: grant,
      lastTrustedTime: now,
      revokedSessionIds: [],
    })
    const onStatusChanged = vi.fn()
    const unowned = sessionHarness(vault, () => now, null, onStatusChanged)
    await expect(unowned.session.initialize()).resolves.toMatchObject({ state: "authenticated" })
    expect(unowned.bindUnownedToAccount).toHaveBeenCalledWith(accountId)
    expect(onStatusChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "authenticated" }),
    )

    const mismatch = sessionHarness(vault, () => now, otherAccountId)
    await expect(mismatch.session.initialize()).resolves.toMatchObject({
      state: "switch_required",
      currentAccountId: otherAccountId,
    })
    await expect(mismatch.session.authorize()).rejects.toEqual(
      new AccountAuthorizationError("switch_required"),
    )
  })

  it("does not prepare a different account against the currently bound collection", async () => {
    const grant = await grantFixture()
    const prepare = vi.fn(async () => undefined)
    const changed = vi.fn()
    const { session } = sessionHarness(
      { version: 1, active: null, lastTrustedTime: now, revokedSessionIds: [] },
      () => now,
      otherAccountId,
      changed,
      prepare,
    )

    await expect(session.acceptGrant(grant)).resolves.toMatchObject({
      state: "switch_required",
      currentAccountId: otherAccountId,
    })
    expect(prepare).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalledWith(expect.objectContaining({ state: "authenticated" }))
  })

  it("rejects invalid token lifetimes directly", async () => {
    const grant = await grantFixture({ accessAudience: "bad" })
    const { session } = sessionHarness({
      version: 1,
      active: grant,
      lastTrustedTime: now,
      revokedSessionIds: [],
    })
    await expect(session.acceptGrant(grant)).rejects.toEqual(new AccountJwtError("invalid"))
  })

  it("prepares account-scoped services before publishing authenticated", async () => {
    const grant = await grantFixture()
    const calls: string[] = []
    const prepare = vi.fn(async () => {
      calls.push("prepared")
    })
    const changed = vi.fn(() => {
      calls.push("published")
    })
    const { session } = sessionHarness(
      { version: 1, active: grant, lastTrustedTime: now, revokedSessionIds: [] },
      () => now,
      accountId,
      changed,
      prepare,
    )

    await expect(session.initialize()).resolves.toMatchObject({ state: "authenticated" })
    expect(prepare).toHaveBeenCalledWith(accountId)
    expect(calls).toEqual(["prepared", "published"])
  })

  it("stays fail-closed when account-scoped service preparation fails", async () => {
    const grant = await grantFixture()
    const changed = vi.fn()
    const prepare = vi.fn(async () => {
      throw new Error("service mount failed")
    })
    const { session } = sessionHarness(
      { version: 1, active: grant, lastTrustedTime: now, revokedSessionIds: [] },
      () => now,
      accountId,
      changed,
      prepare,
    )

    await expect(session.initialize()).rejects.toThrow("service mount failed")
    expect(changed).not.toHaveBeenCalledWith(expect.objectContaining({ state: "authenticated" }))
    await expect(session.authorize()).rejects.toEqual(new AccountAuthorizationError("locked"))
  })
})
