import { aiPolicy } from "../shared/documentAiJobs"

export type BudgetJobKind = "background" | "explicit"
export type BudgetUsage = {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCostUsd: number
}
export type BudgetRequest = {
  readonly kind: BudgetJobKind
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCostUsd: number | null
}
export type BudgetSnapshot = BudgetUsage & {
  readonly requests: number
  readonly softPaused: boolean
}
export type BudgetReservation = {
  readonly status: "reserved"
  readonly id: string
  readonly request: BudgetRequest
}
export type BudgetDecision =
  | BudgetReservation
  | { readonly status: "paused"; readonly reason: "unknown_pricing" | "soft_cap" }
  | {
      readonly status: "hard_cap"
      readonly reason: "requests" | "input_tokens" | "output_tokens" | "cost"
    }

export class AiBudgetLedger {
  readonly #committed: {
    requests: number
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    softPaused: boolean
  } = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    softPaused: false,
  }
  readonly #reservations = new Map<string, BudgetRequest>()
  #nextId = 1

  reserve(request: BudgetRequest): BudgetDecision {
    const projected = this.#project(request)
    if (request.kind === "background" && request.estimatedCostUsd === null)
      return { status: "paused", reason: "unknown_pricing" }
    if (request.kind === "background" && projected.cost >= aiPolicy.structureBudgetUsd)
      return { status: "paused", reason: "soft_cap" }
    if (projected.requests > aiPolicy.sessionRequests)
      return { status: "hard_cap", reason: "requests" }
    if (projected.inputTokens > aiPolicy.sessionInputTokens)
      return { status: "hard_cap", reason: "input_tokens" }
    if (projected.outputTokens > aiPolicy.sessionOutputTokens)
      return { status: "hard_cap", reason: "output_tokens" }
    if (projected.cost > aiPolicy.sessionBudgetUsd) return { status: "hard_cap", reason: "cost" }
    const id = `reservation:${this.#nextId}`
    this.#nextId += 1
    this.#reservations.set(id, request)
    return { status: "reserved", id, request }
  }

  commit(reservation: BudgetReservation, usage: BudgetUsage): void {
    const request = this.#reservations.get(reservation.id)
    if (!request) return
    this.#reservations.delete(reservation.id)
    this.#committed.requests += 1
    this.#committed.inputTokens += usage.inputTokens
    this.#committed.outputTokens += usage.outputTokens
    this.#committed.estimatedCostUsd += usage.estimatedCostUsd
    this.#committed.softPaused = this.#committed.estimatedCostUsd >= aiPolicy.structureBudgetUsd
  }

  release(reservation: BudgetReservation): void {
    this.#reservations.delete(reservation.id)
  }

  snapshot(): BudgetSnapshot {
    return { ...this.#committed }
  }

  #project(request: BudgetRequest): {
    readonly requests: number
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cost: number
  } {
    let reservedRequests = 0
    let reservedInput = 0
    let reservedOutput = 0
    let reservedCost = 0
    for (const reservation of this.#reservations.values()) {
      reservedRequests += 1
      reservedInput += reservation.inputTokens
      reservedOutput += reservation.outputTokens
      reservedCost += reservation.estimatedCostUsd ?? 0
    }
    return {
      requests: this.#committed.requests + reservedRequests + 1,
      inputTokens: this.#committed.inputTokens + reservedInput + request.inputTokens,
      outputTokens: this.#committed.outputTokens + reservedOutput + request.outputTokens,
      cost: this.#committed.estimatedCostUsd + reservedCost + (request.estimatedCostUsd ?? 0),
    }
  }
}
