import { z } from "zod"
import type { TokenService } from "./appTokens"
import {
  type Account,
  CHALLENGE_TTL_SECONDS,
  type ChallengeResponse,
  RENEWAL_TTL_SECONDS,
  type SessionResponse,
} from "./contracts"
import { pkceChallenge, randomOpaqueToken, sha256Hex } from "./crypto"
import { ApiError } from "./errors"
import type { GoogleVerifier } from "./googleIdentity"

const ChallengeRowSchema = z
  .object({
    nonce: z.string(),
    pkceChallenge: z.string(),
    expiresAt: z.number().int(),
    consumedAt: z.number().int().nullable(),
  })
  .strict()
const AccountRowSchema = z.object({ id: z.uuid(), displayName: z.string().nullable() }).strict()

type CreateChallengeInput = {
  readonly codeChallenge: string
  readonly clientKey: string
  readonly nowSeconds: number
}

export async function createChallenge(
  db: D1Database,
  input: CreateChallengeInput,
): Promise<ChallengeResponse> {
  const id = crypto.randomUUID()
  const nonce = randomOpaqueToken()
  const expiresAt = input.nowSeconds + CHALLENGE_TTL_SECONDS
  const clientKeyHash = await sha256Hex(input.clientKey)
  const results = await db.batch([
    db.prepare("DELETE FROM login_challenges WHERE expires_at <= ?1").bind(input.nowSeconds),
    db.prepare("DELETE FROM rate_limits WHERE expires_at <= ?1").bind(input.nowSeconds),
    db
      .prepare(
        `INSERT INTO login_challenges
         (id, nonce, pkce_challenge, client_key_hash, created_at, expires_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE (SELECT COUNT(*) FROM login_challenges
              WHERE client_key_hash = ?4 AND consumed_at IS NULL AND expires_at > ?5) < 5`,
      )
      .bind(id, nonce, input.codeChallenge, clientKeyHash, input.nowSeconds, expiresAt),
  ])
  if (results[2]?.meta.changes !== 1) {
    throw new ApiError(429, "rate_limited", "Too many active login challenges")
  }
  return { challengeId: id, nonce, pkceMethod: "S256", expiresAt }
}

type ExchangeInput = {
  readonly request: {
    readonly challengeId: string
    readonly codeVerifier: string
    readonly idToken: string
  }
  readonly nowSeconds: number
  readonly verifyGoogleToken: GoogleVerifier
  readonly tokenService: TokenService
}

export async function exchangeChallenge(
  db: D1Database,
  input: ExchangeInput,
): Promise<SessionResponse> {
  const row = await db
    .prepare(
      `SELECT nonce, pkce_challenge AS pkceChallenge, expires_at AS expiresAt,
              consumed_at AS consumedAt
       FROM login_challenges WHERE id = ?1`,
    )
    .bind(input.request.challengeId)
    .first()
  const parsed = ChallengeRowSchema.safeParse(row)
  if (
    !parsed.success ||
    parsed.data.consumedAt !== null ||
    parsed.data.expiresAt <= input.nowSeconds ||
    parsed.data.pkceChallenge !== (await pkceChallenge(input.request.codeVerifier))
  ) {
    throw new ApiError(409, "invalid_challenge", "Login challenge is invalid or expired")
  }

  const identity = await input.verifyGoogleToken(
    input.request.idToken,
    parsed.data.nonce,
    input.nowSeconds,
  )
  const accountId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()
  const consumeMarker = randomOpaqueToken()
  const renewalToken = randomOpaqueToken("sr_")
  const renewalHash = await sha256Hex(renewalToken)
  const renewalExpiresAt = input.nowSeconds + RENEWAL_TTL_SECONDS
  const expectedPkce = await pkceChallenge(input.request.codeVerifier)

  const results = await db.batch([
    db
      .prepare(
        `UPDATE login_challenges
       SET consumed_at = ?1, consume_marker = ?2, consumed_subject = ?3
       WHERE id = ?4 AND consumed_at IS NULL AND expires_at > ?1 AND pkce_challenge = ?5`,
      )
      .bind(
        input.nowSeconds,
        consumeMarker,
        identity.subject,
        input.request.challengeId,
        expectedPkce,
      ),
    db
      .prepare(
        `INSERT INTO accounts (id, google_sub, display_name, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?4 FROM login_challenges
       WHERE id = ?5 AND consume_marker = ?6
       ON CONFLICT (google_sub) DO UPDATE
       SET display_name = COALESCE(excluded.display_name, accounts.display_name),
           updated_at = excluded.updated_at`,
      )
      .bind(
        accountId,
        identity.subject,
        identity.displayName,
        input.nowSeconds,
        input.request.challengeId,
        consumeMarker,
      ),
    db
      .prepare(
        `UPDATE sessions SET revoked_at = ?1, revoke_reason = 'session_cap'
       WHERE account_id = (SELECT id FROM accounts WHERE google_sub = ?2)
         AND revoked_at IS NULL AND renewal_expires_at > ?1
         AND id NOT IN (
           SELECT id FROM sessions
           WHERE account_id = (SELECT id FROM accounts WHERE google_sub = ?2)
             AND revoked_at IS NULL AND renewal_expires_at > ?1
           ORDER BY created_at DESC, id DESC LIMIT 9
         )
         AND EXISTS (SELECT 1 FROM login_challenges WHERE id = ?3 AND consume_marker = ?4)`,
      )
      .bind(input.nowSeconds, identity.subject, input.request.challengeId, consumeMarker),
    db
      .prepare(
        `INSERT INTO sessions
         (id, account_id, created_at, last_rotated_at, renewal_expires_at)
       SELECT ?1, accounts.id, ?2, ?2, ?3
       FROM accounts JOIN login_challenges
       WHERE accounts.google_sub = ?4 AND login_challenges.id = ?5
         AND login_challenges.consume_marker = ?6`,
      )
      .bind(
        sessionId,
        input.nowSeconds,
        renewalExpiresAt,
        identity.subject,
        input.request.challengeId,
        consumeMarker,
      ),
    db
      .prepare(
        `INSERT INTO renewal_tokens
         (token_hash, session_id, account_id, created_at, expires_at)
       SELECT ?1, id, account_id, ?2, ?3 FROM sessions WHERE id = ?4`,
      )
      .bind(renewalHash, input.nowSeconds, renewalExpiresAt, sessionId),
  ])
  if (
    results[0]?.meta.changes !== 1 ||
    results[3]?.meta.changes !== 1 ||
    results[4]?.meta.changes !== 1
  ) {
    throw new ApiError(409, "invalid_challenge", "Login challenge is invalid or already consumed")
  }

  const account = await accountForSession(db, sessionId)
  const grant = await input.tokenService.grant({
    accountId: account.id,
    sessionId,
    renewalToken,
    nowSeconds: input.nowSeconds,
    renewalExpiresAt,
  })
  return { account, ...grant }
}

async function accountForSession(db: D1Database, sessionId: string): Promise<Account> {
  const row = await db
    .prepare(
      `SELECT accounts.id, accounts.display_name AS displayName
       FROM accounts JOIN sessions ON sessions.account_id = accounts.id
       WHERE sessions.id = ?1`,
    )
    .bind(sessionId)
    .first()
  const parsed = AccountRowSchema.safeParse(row)
  if (!parsed.success) throw new ApiError(500, "service_misconfigured", "Account write failed")
  return parsed.data
}
