import { z } from "zod"

import { sha256Hex } from "./crypto"
import { ApiError } from "./errors"

export type RateScope = "account" | "challenge" | "exchange" | "logout" | "renew"

const CountRowSchema = z.object({ requestCount: z.number().int().positive() }).strict()

function scopeLimit(scope: RateScope): number {
  switch (scope) {
    case "challenge":
      return 10
    case "exchange":
    case "logout":
      return 20
    case "renew":
      return 30
    case "account":
      return 120
  }
}

type RateInput = {
  readonly scope: RateScope
  readonly clientKey: string
  readonly nowSeconds: number
}

export async function enforceRateLimit(db: D1Database, input: RateInput): Promise<void> {
  const windowStart = input.nowSeconds - (input.nowSeconds % 60)
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (scope, key_hash, window_start, request_count, expires_at)
       VALUES (?1, ?2, ?3, 1, ?4)
       ON CONFLICT (scope, key_hash, window_start)
       DO UPDATE SET request_count = request_count + 1
       RETURNING request_count AS requestCount`,
    )
    .bind(input.scope, await sha256Hex(input.clientKey), windowStart, windowStart + 120)
    .first()
  const parsed = CountRowSchema.safeParse(row)
  if (!parsed.success) throw new ApiError(500, "service_misconfigured", "Rate limit failed")
  if (parsed.data.requestCount > scopeLimit(input.scope)) {
    throw new ApiError(429, "rate_limited", "Too many requests")
  }
}
