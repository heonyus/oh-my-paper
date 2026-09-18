import type { CodexAccountStatus } from "../shared/codexTypes"
import type { WebSearchCapability } from "../shared/researchSourceSchemas"

export type CodexWebSearchProtocolCapability = {
  readonly webSearch: boolean
  readonly detail: string | null
}

function quotaReached(status: CodexAccountStatus): boolean {
  const limits = status.rateLimits
  if (limits === null || limits === undefined) return false
  const snapshots = [limits.rateLimits, ...Object.values(limits.rateLimitsByLimitId ?? {})]
  return snapshots.some(
    (snapshot) =>
      snapshot.spendControlReached === true ||
      (snapshot.rateLimitReachedType !== null && snapshot.rateLimitReachedType !== undefined) ||
      snapshot.primary?.usedPercent === 100 ||
      snapshot.secondary?.usedPercent === 100,
  )
}

export function capabilityFor(
  status: CodexAccountStatus,
  protocol: CodexWebSearchProtocolCapability,
): WebSearchCapability {
  if (!status.available) {
    return { status: "unavailable", reason: "runtime_missing", detail: status.error ?? null }
  }
  if (!status.authenticated || status.account === null) {
    return {
      status: "unavailable",
      reason: "authentication_required",
      detail: status.error ?? null,
    }
  }
  if (status.account.type !== "chatgpt") {
    return {
      status: "unavailable",
      reason: "billing_unverified",
      detail: "The active Codex account is not a ChatGPT subscription account.",
    }
  }
  if (quotaReached(status)) {
    return { status: "unavailable", reason: "quota_reached", detail: "Codex usage limit reached." }
  }
  if (!protocol.webSearch) {
    return {
      status: "unavailable",
      reason: "protocol_unavailable",
      detail: protocol.detail ?? "The Codex app-server does not advertise web search.",
    }
  }
  return {
    status: "unavailable",
    reason: "structured_sources_unsupported",
    detail: "The installed Codex app-server exposes no supported structured source result schema.",
  }
}
