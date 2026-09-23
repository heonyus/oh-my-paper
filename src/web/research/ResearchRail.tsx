import { MessageSquare, SquarePen } from "lucide-react"
import type { JSX } from "react"
import type { AgentThread } from "../../shared/agentChat"
import { groupThreads } from "./agentThreadModel"

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
  const groups = groupThreads(threads)
  return (
    <aside className="research-rail" aria-label="리서치 채팅 기록">
      <button type="button" className="research-new-chat" onClick={onNew}>
        <SquarePen size={15} aria-hidden="true" />새 채팅
      </button>
      <nav className="research-history">
        {groups.map((group) => (
          <section key={group.key} className="research-history-group">
            <h3>{group.label}</h3>
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
        {threads.length === 0 ? (
          <p className="research-history-empty">아직 대화가 없습니다</p>
        ) : null}
      </nav>
    </aside>
  )
}
