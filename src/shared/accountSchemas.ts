import { z } from "zod"

export const accountIdSchema = z.uuid().brand<"AccountId">()
export const accountSessionIdSchema = z.uuid().brand<"AccountSessionId">()

export const accountSchema = z
  .object({
    id: accountIdSchema,
    displayName: z.string().min(1).max(120).nullable(),
  })
  .strict()

export const offlineLeaseKeySchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    y: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    alg: z.literal("ES256"),
    use: z.literal("sig"),
    kid: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  })
  .strict()

const jwtSchema = z
  .string()
  .min(64)
  .max(8_192)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
const renewalTokenSchema = z.string().regex(/^sr_[A-Za-z0-9_-]{43}$/u)

export const accountSessionGrantSchema = z
  .object({
    account: accountSchema,
    accessToken: jwtSchema,
    accessExpiresAt: z.number().int().positive(),
    renewalToken: renewalTokenSchema,
    renewalExpiresAt: z.number().int().positive(),
    offlineLease: jwtSchema,
    offlineLeaseExpiresAt: z.number().int().positive(),
    offlineLeaseKey: offlineLeaseKeySchema,
  })
  .strict()

export const accountStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("local"), accountId: accountIdSchema }).strict(),
  z.object({
    state: z.literal("credentials_needed"),
    reason: z.enum(["service_not_configured", "keychain_unavailable", "credential_corrupt"]),
  }),
  z.object({ state: z.literal("signed_out") }),
  z.object({
    state: z.literal("authenticated"),
    account: accountSchema,
    connection: z.enum(["online", "offline"]),
    offlineLeaseExpiresAt: z.number().int().positive(),
  }),
  z.object({
    state: z.literal("locked"),
    reason: z.enum(["expired", "clock_rollback", "revoked"]),
    dirtySaveAccountId: accountIdSchema,
  }),
  z.object({
    state: z.literal("switch_required"),
    currentAccountId: accountIdSchema,
    nextAccount: accountSchema,
  }),
])

export const accountEntitlementSchema = z.object({ tier: z.literal("free") }).strict()
export const accountRefreshTriggerSchema = z.enum(["foreground", "reconnect", "protected_request"])
export const collectionSwitchChoiceSchema = z.enum([
  "open_existing_for_account",
  "create_separate_collection",
  "cancel",
])

export const accountCredentialVaultSchema = z
  .object({
    version: z.literal(1),
    active: accountSessionGrantSchema.nullable(),
    lastTrustedTime: z.number().int().nonnegative(),
    revokedSessionIds: z.array(accountSessionIdSchema).max(32),
  })
  .strict()

export type Account = z.infer<typeof accountSchema>
export type AccountId = z.infer<typeof accountIdSchema>
export type AccountSessionGrant = z.infer<typeof accountSessionGrantSchema>
export type AccountSessionId = z.infer<typeof accountSessionIdSchema>
export type AccountStatus = z.infer<typeof accountStatusSchema>
export type AccountEntitlement = z.infer<typeof accountEntitlementSchema>
export type AccountRefreshTrigger = z.infer<typeof accountRefreshTriggerSchema>
export type AccountCredentialVault = z.infer<typeof accountCredentialVaultSchema>
export type CollectionSwitchChoice = z.infer<typeof collectionSwitchChoiceSchema>
