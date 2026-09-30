import { MessageSquare, SquarePen } from "lucide-react"
import type { JSX } from "react"
import { useTranslator } from "../../renderer/lib/locale"
import type { AgentThread } from "../../shared/agentChat"
import { groupThreads } from "./agentThreadModel"
import { researchViewMessages } from "./messages"

export function ResearchRail({
  threads,
  activeId,
  onNew,
  onSelect,
}: {
  readonly threads: readonly AgentThread[]
  readonly activeId: string | null
  readonly onNew: () => void
  readonly onSelect: (id: string) => void
}): JSX.Element {
  const t = useTranslator(researchViewMessages)
  const groups = groupThreads(threads)
  return (
    <aside className="research-rail" aria-label={t("rail.label")}>
      <button type="button" className="research-new-chat" onClick={onNew}>
        <SquarePen size={15} aria-hidden="true" />
        {t("rail.new")}
      </button>
      <nav className="research-history">
        {groups.map((group) => (
          <section key={group.key} className="research-history-group">
            <h3>{t(`rail.group.${group.key}`)}</h3>
            <ul>
              {group.threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    className="research-history-item"
                    aria-current={thread.id === activeId ? "true" : undefined}
                    title={thread.title}
                    onClick={() => onSelect(thread.id)}
                  >
                    <MessageSquare size={13} aria-hidden="true" />
                    <span>{thread.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {threads.length === 0 ? <p className="research-history-empty">{t("rail.empty")}</p> : null}
      </nav>
    </aside>
  )
}
