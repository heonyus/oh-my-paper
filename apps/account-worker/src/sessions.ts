import { z } from "zod"
import type { AccessIdentity, TokenService } from "./appTokens"
import type { Account, SessionResponse } from "./contracts"
import { randomOpaqueToken, sha256Hex } from "./crypto"
import { ApiError } from "./errors"

const SessionAccountRowSchema = z
  .object({
    sessionId: z.uuid(),
    accountId: z.uuid(),
    displayName: z.string().nullable(),
    renewalExpiresAt: z.number().int(),
  })
  .strict()
const RenewalStateRowSchema = z
  .object({
    sessionId: z.uuid(),
    consumedAt: z.number().int().nullable(),
    tokenRevokedAt: z.number().int().nullable(),
    sessionRevokedAt: z.number().int().nullable(),
    expiresAt: z.number().int(),
  })
  .strict()

type RenewInput = {
  readonly renewalToken: string
  readonly nowSeconds: number
  readonly tokenService: TokenService
}

export async function renewSession(db: D1Database, input: RenewInput): Promise<SessionResponse> {
  const oldHash = await sha256Hex(input.renewalToken)
  const renewalToken = randomOpaqueToken("sr_")
  const newHash = await sha256Hex(renewalToken)
  const results = await db.batch([
    db
      .prepare(
        `UPDATE renewal_tokens SET consumed_at = ?1, replacement_token_hash = ?2
       WHERE token_hash = ?3 AND consumed_at IS NULL AND revoked_at IS NULL
         AND expires_at > ?1
         AND EXISTS (
           SELECT 1 FROM sessions WHERE id = renewal_tokens.session_id
             AND revoked_at IS NULL AND renewal_expires_at > ?1 AND rotation_count < 4096
         )`,
      )
      .bind(input.nowSeconds, newHash, oldHash),
    db
      .prepare(
        `INSERT INTO renewal_tokens
         (token_hash, session_id, account_id, created_at, expires_at)
       SELECT ?1, renewal_tokens.session_id, renewal_tokens.account_id, ?2,
              sessions.renewal_expires_at
       FROM renewal_tokens JOIN sessions ON sessions.id = renewal_tokens.session_id
       WHERE renewal_tokens.token_hash = ?3
         AND renewal_tokens.consumed_at = ?2
         AND renewal_tokens.replacement_token_hash = ?1
         AND sessions.revoked_at IS NULL`,
      )
      .bind(newHash, input.nowSeconds, oldHash),
    db
      .prepare(
        `UPDATE sessions SET last_rotated_at = ?1, rotation_count = rotation_count + 1
       WHERE id = (SELECT session_id FROM renewal_tokens WHERE token_hash = ?2)
         AND revoked_at IS NULL AND rotation_count < 4096`,
      )
      .bind(input.nowSeconds, newHash),
  ])

  if (
    results[0]?.meta.changes !== 1 ||
    results[1]?.meta.changes !== 1 ||
    results[2]?.meta.changes !== 1
  ) {
    await rejectFailedRenewal(db, oldHash, input.nowSeconds)
  }

  const session = await sessionForToken(db, newHash, input.nowSeconds)
  const grant = await input.tokenService.grant({
    accountId: session.accountId,
    sessionId: session.sessionId,
    renewalToken,
    nowSeconds: input.nowSeconds,
    renewalExpiresAt: session.renewalExpiresAt,
  })
  return {
    account: { id: session.accountId, displayName: session.displayName },
    ...grant,
  }
}

async function rejectFailedRenewal(
  db: D1Database,
  tokenHash: string,
  nowSeconds: number,
): Promise<never> {
  const row = await db
    .prepare(
      `SELECT renewal_tokens.session_id AS sessionId,
              renewal_tokens.consumed_at AS consumedAt,
              renewal_tokens.revoked_at AS tokenRevokedAt,
              sessions.revoked_at AS sessionRevokedAt,
              renewal_tokens.expires_at AS expiresAt
       FROM renewal_tokens JOIN sessions ON sessions.id = renewal_tokens.session_id
       WHERE renewal_tokens.token_hash = ?1`,
    )
    .bind(tokenHash)
    .first()
  const parsed = RenewalStateRowSchema.safeParse(row)
  if (
    parsed.success &&
    parsed.data.consumedAt !== null &&
    parsed.data.tokenRevokedAt === null &&
    parsed.data.sessionRevokedAt === null &&
    parsed.data.expiresAt > nowSeconds
  ) {
    await db.batch([
      db
        .prepare(
          "UPDATE sessions SET revoked_at = ?1, revoke_reason = 'renewal_reuse' WHERE id = ?2 AND revoked_at IS NULL",
        )
        .bind(nowSeconds, parsed.data.sessionId),
      db
        .prepare(
          "UPDATE renewal_tokens SET revoked_at = ?1 WHERE session_id = ?2 AND revoked_at IS NULL",
        )
        .bind(nowSeconds, parsed.data.sessionId),
    ])
    throw new ApiError(401, "renewal_reuse", "Renewal credential reuse revoked the session")
  }
  throw new ApiError(401, "invalid_renewal", "Renewal credential is missing, invalid, or expired")
}

async function sessionForToken(db: D1Database, tokenHash: string, nowSeconds: number) {
  const row = await db
    .prepare(
      `SELECT sessions.id AS sessionId, accounts.id AS accountId,
              accounts.display_name AS displayName,
              sessions.renewal_expires_at AS renewalExpiresAt
       FROM renewal_tokens
       JOIN sessions ON sessions.id = renewal_tokens.session_id
       JOIN accounts ON accounts.id = sessions.account_id
       WHERE renewal_tokens.token_hash = ?1 AND renewal_tokens.revoked_at IS NULL
         AND renewal_tokens.expires_at > ?2 AND sessions.revoked_at IS NULL
         AND sessions.renewal_expires_at > ?2`,
    )
    .bind(tokenHash, nowSeconds)
    .first()
  const parsed = SessionAccountRowSchema.safeParse(row)
  if (!parsed.success) {
    throw new ApiError(401, "invalid_renewal", "Renewal credential is missing, invalid, or expired")
  }
  return parsed.data
}

export async function accountForAccess(
  db: D1Database,
  identity: AccessIdentity,
  nowSeconds: number,
): Promise<Account> {
  const row = await db
    .prepare(
      `SELECT sessions.id AS sessionId, accounts.id AS accountId,
              accounts.display_name AS displayName,
              sessions.renewal_expires_at AS renewalExpiresAt
       FROM sessions JOIN accounts ON accounts.id = sessions.account_id
       WHERE sessions.id = ?1 AND accounts.id = ?2 AND sessions.revoked_at IS NULL
         AND sessions.renewal_expires_at > ?3`,
    )
    .bind(identity.sessionId, identity.accountId, nowSeconds)
    .first()
  const parsed = SessionAccountRowSchema.safeParse(row)
  if (!parsed.success) throw new ApiError(401, "invalid_access", "Access credential is invalid")
  return { id: parsed.data.accountId, displayName: parsed.data.displayName }
}

export async function logoutSession(
  db: D1Database,
  renewalToken: string,
  nowSeconds: number,
): Promise<void> {
  const tokenHash = await sha256Hex(renewalToken)
  const results = await db.batch([
    db
      .prepare(
        `UPDATE sessions SET revoked_at = ?1, revoke_reason = 'logout'
       WHERE id = (SELECT session_id FROM renewal_tokens WHERE token_hash = ?2)
         AND revoked_at IS NULL`,
      )
      .bind(nowSeconds, tokenHash),
    db
      .prepare(
        `UPDATE renewal_tokens SET revoked_at = ?1
       WHERE session_id = (SELECT session_id FROM renewal_tokens WHERE token_hash = ?2)
         AND revoked_at IS NULL`,
      )
      .bind(nowSeconds, tokenHash),
  ])
  if (results[0]?.meta.changes !== 1) {
    throw new ApiError(401, "invalid_renewal", "Renewal credential is missing or invalid")
  }
}
