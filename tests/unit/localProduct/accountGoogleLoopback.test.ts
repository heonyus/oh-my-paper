import { describe, expect, it } from "vitest"
import { GoogleLoopbackError, startGoogleLoopback } from "../../../src/electron/googleLoopback"

describe("Google native loopback", () => {
  it("rejects a bad state without consuming the pending callback", async () => {
    const loopback = await startGoogleLoopback("expected-state", 2_000)
    const wrong = await fetch(`${loopback.redirectUri}?code=attacker-code&state=wrong-state`)
    expect(wrong.status).toBe(400)

    const accepted = await fetch(`${loopback.redirectUri}?code=google-code&state=expected-state`)
    expect(accepted.status).toBe(200)
    await expect(loopback.result).resolves.toBe("google-code")
    await expect(
      fetch(`${loopback.redirectUri}?code=replayed&state=expected-state`),
    ).rejects.toThrow()
  })

  it("supports explicit cancellation", async () => {
    const loopback = await startGoogleLoopback("state", 2_000)
    loopback.cancel()
    await expect(loopback.result).rejects.toEqual(new GoogleLoopbackError("cancelled"))
  })

  it("times out a callback that never arrives", async () => {
    const loopback = await startGoogleLoopback("state", 5)
    await expect(loopback.result).rejects.toEqual(new GoogleLoopbackError("timeout"))
  })
})
