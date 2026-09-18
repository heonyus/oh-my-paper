import { env } from "cloudflare:workers"
import { importJWK, jwtVerify } from "jose"
import { beforeEach, describe, expect, it } from "vitest"

import { ACCESS_AUDIENCE, OFFLINE_AUDIENCE, OFFLINE_PURPOSE } from "../src/contracts"
import { createHarness, resetDatabase } from "./harness"

beforeEach(resetDatabase)

describe("signed credential contract", () => {
  it("signs access credentials with the advertised public key and API purpose", async () => {
    // Given
    const harness = await createHarness()
    const session = await harness.login()
    const publicKey = await importJWK(session.offlineLeaseKey, "ES256")

    // When
    const verified = await jwtVerify(session.accessToken, publicKey, {
      algorithms: ["ES256"],
      audience: ACCESS_AUDIENCE,
      issuer: env.APP_ISSUER,
      currentDate: new Date(harness.now() * 1_000),
      typ: "JWT",
    })

    // Then
    expect(verified.payload).toMatchObject({ purpose: "account-api" })
    expect(verified.payload.sub).toBe(session.account.id)
    expect(verified.payload.exp).toBe(session.accessExpiresAt)
  })

  it("signs a purpose-bound offline lease with no private key material", async () => {
    // Given
    const harness = await createHarness()
    const session = await harness.login()
    const publicKey = await importJWK(session.offlineLeaseKey, "ES256")

    // When
    const verified = await jwtVerify(session.offlineLease, publicKey, {
      algorithms: ["ES256"],
      audience: OFFLINE_AUDIENCE,
      issuer: env.APP_ISSUER,
      currentDate: new Date(harness.now() * 1_000),
      typ: "JWT",
    })

    // Then
    expect(verified.payload).toMatchObject({ purpose: OFFLINE_PURPOSE })
    expect(verified.payload.exp).toBe(session.offlineLeaseExpiresAt)
    expect(session.offlineLeaseKey).not.toHaveProperty("d")
  })
})
