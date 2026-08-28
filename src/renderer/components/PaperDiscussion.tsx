import { Send } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import type { AiHistoryMessage, ProviderStatus } from "../../shared/ipc"

type ChatEntry = AiHistoryMessage & { readonly id: string }

export function PaperDiscussion({
  provider,
  onAsk,
}: {
  readonly provider: ProviderStatus
  readonly onAsk: (question: string, history: readonly AiHistoryMessage[]) => Promise<string>
}): JSX.Element {
  const [entries, setEntries] = useState<readonly ChatEntry[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const question = input.trim()
    if (!question || sending) return
    const history = entries.map(({ role, content }) => ({ role, content }))
    setEntries((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: question },
    ])
    setInput("")
    setSending(true)
    try {
      const answer = await onAsk(question, history)
      setEntries((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: answer },
      ])
    } catch {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "AI provider 설정을 확인한 뒤 다시 보내주세요.",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="discussion-section" aria-label="논문 토론">
      <header>
        <h3>토론</h3>
        <span>{entries.length}</span>
      </header>
      <div className="discussion-messages" aria-live="polite">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <article key={entry.id} data-role={entry.role}>
              <strong>{entry.role === "user" ? "나" : "Scourgify"}</strong>
              <p>{entry.content}</p>
            </article>
          ))
        ) : (
          <p className="insight-muted">
            방법의 타당성, 한계, 후속 연구를 논문 근거와 함께 물어보세요.
          </p>
        )}
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <textarea
          aria-label="논문 토론 질문"
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder="무엇이든 질문하세요."
          rows={2}
        />
        <div>
          <span className="discussion-model">{provider.model}</span>
          <button type="submit" disabled={!input.trim() || sending} aria-label="토론 질문 보내기">
            <Send size={15} />
          </button>
        </div>
      </form>
    </section>
  )
}
