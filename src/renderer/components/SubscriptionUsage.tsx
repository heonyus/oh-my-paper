import type { JSX } from "react"
import type {
  CodexAccountStatus,
  CodexRateLimitSnapshot,
  CodexRateLimitWindow,
} from "../../shared/codexTypes"
import { useTranslator } from "../lib/locale"
import { subscriptionMessages } from "../messages/subscription"

export function SubscriptionUsage({
  status,
}: {
  readonly status: CodexAccountStatus
}): JSX.Element {
  const t = useTranslator(subscriptionMessages)
  const limits = status.rateLimits
  const snapshots: ReadonlyArray<readonly [string, CodexRateLimitSnapshot]> =
    limits?.rateLimitsByLimitId
      ? Object.entries(limits.rateLimitsByLimitId)
      : limits
        ? [["account", limits.rateLimits]]
        : []
  return (
    <fieldset className="settings-help" aria-label={t("sub.usage")}>
      <p>
        {t("sub.usage.plan", {
          plan:
            status.account?.type === "chatgpt"
              ? status.account.planType
              : t("sub.usage.planUnknown"),
        })}
      </p>
      {snapshots.length === 0 ? (
        <p>{t("sub.usage.none")}</p>
      ) : (
        snapshots.map(([id, snapshot]) => (
          <div key={id}>
            <strong>{snapshot.limitName ?? snapshot.limitId ?? t("sub.usage.accountLimit")}</strong>
            <UsageWindow label={t("sub.usage.shortTerm")} value={snapshot.primary} />
            <UsageWindow label={t("sub.usage.longTerm")} value={snapshot.secondary} />
          </div>
        ))
      )}
      <p>{t("sub.usage.shared")}</p>
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
  const t = useTranslator(subscriptionMessages)
  if (!value) return null
  return (
    <p>
      {t("sub.usage.left", { window: label, percent: Math.max(0, 100 - value.usedPercent) })}
      {value.resetsAt
        ? ` · ${t("sub.usage.resets", { time: new Date(value.resetsAt * 1000).toLocaleString() })}`
        : ""}
    </p>
  )
}
