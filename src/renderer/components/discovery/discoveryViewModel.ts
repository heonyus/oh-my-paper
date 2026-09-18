import type {
  ScholarlySearchItem,
  ScholarlySearchResult,
} from "../../../shared/scholarlySearchSchemas"

export function optionalYear(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

export function providerErrorSummary(result: ScholarlySearchResult): string | null {
  const messages = result.providers.flatMap((state) => {
    if (state.status !== "error") return []
    const retry = state.error.retryAfterSeconds
    const suffix = retry === null ? "" : ` (${retry}초 후 재시도)`
    return [`${state.provider}: ${state.error.kind}${suffix}`]
  })
  return messages.length > 0 ? messages.join(" · ") : null
}

export function scholarlyItemKey(item: ScholarlySearchItem): string {
  return `${item.provider}:${item.identity.providerRecordId}`
}
