import { describe, expect, it } from "vitest"
import { AiBudgetLedger } from "../../src/electron/aiBudgetLedger"

describe("AiBudgetLedger", () => {
  it("pauses background work at the soft cap and rejects explicit work at hard caps", () => {
    // Given
    const ledger = new AiBudgetLedger()

    // When
    const background = ledger.reserve({
      kind: "background",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0.5,
    })
    const explicit = ledger.reserve({
      kind: "explicit",
      inputTokens: 250_001,
      outputTokens: 32_000,
      estimatedCostUsd: 1.5,
    })

    // Then
    expect(background.status).toBe("paused")
    expect(explicit.status).toBe("hard_cap")
    expect(ledger.snapshot().inputTokens).toBe(0)
  })

  it("records actual usage only after a completed job", () => {
    // Given
    const ledger = new AiBudgetLedger()
    const reservation = ledger.reserve({
      kind: "explicit",
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.01,
    })

    // When
    if (reservation.status !== "reserved") throw new Error("reservation was not accepted")
    ledger.commit(reservation, { inputTokens: 8, outputTokens: 4, estimatedCostUsd: 0.008 })

    // Then
    expect(ledger.snapshot()).toMatchObject({
      inputTokens: 8,
      outputTokens: 4,
      estimatedCostUsd: 0.008,
    })
  })
})
