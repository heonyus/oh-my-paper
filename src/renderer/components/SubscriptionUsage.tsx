import type { JSX } from "react"
import type {
  CodexAccountStatus,
  CodexRateLimitSnapshot,
  CodexRateLimitWindow,
} from "../../shared/codexTypes"

export function SubscriptionUsage({
  status,
}: {
  readonly status: CodexAccountStatus
}): JSX.Element {
  const limits = status.rateLimits
  const snapshots: ReadonlyArray<readonly [string, CodexRateLimitSnapshot]> =
    limits?.rateLimitsByLimitId
      ? Object.entries(limits.rateLimitsByLimitId)
      : limits
        ? [["account", limits.rateLimits]]
        : []
  return (
    <fieldset className="settings-help" aria-label="구독 사용량">
      <p>플랜: {status.account?.type === "chatgpt" ? status.account.planType : "확인되지 않음"}</p>
      {snapshots.length === 0 ? (
        <p>사용량 정보를 제공받지 못했습니다.</p>
      ) : (
        snapshots.map(([id, snapshot]) => (
          <div key={id}>
            <strong>{snapshot.limitName ?? snapshot.limitId ?? "계정 한도"}</strong>
            <UsageWindow label="단기" value={snapshot.primary} />
            <UsageWindow label="장기" value={snapshot.secondary} />
          </div>
        ))
      )}
      <p>같은 계정의 다른 앱과 한도를 공유합니다. 한도에 도달해도 API로 자동 전환하지 않습니다.</p>
    </fieldset>
  )
}

function UsageWindow({
  label,
  value,
}: {
  readonly label: string
  readonly value?: CodexRateLimitWindow | null | undefined
}): JSX.Element | null {
  if (!value) return null
  return (
    <p>
      {label} · {Math.max(0, 100 - value.usedPercent)}% 남음
      {value.resetsAt ? ` · ${new Date(value.resetsAt * 1000).toLocaleString()} 갱신` : ""}
    </p>
  )
}
