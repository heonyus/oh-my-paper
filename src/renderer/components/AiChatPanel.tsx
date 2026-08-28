import { Bot, LayoutGrid, Send, Sparkles } from "lucide-react"
import { type FormEvent, type JSX, useState } from "react"
import type { AiHistoryMessage, ProviderStatus } from "../../shared/ipc"

type ChatEntry = AiHistoryMessage & { readonly id: string }

type AiChatPanelProps = {
  readonly page: number
  readonly provider: ProviderStatus
  readonly onClose: () => void
  readonly onAsk: (question: string, history: readonly AiHistoryMessage[]) => Promise<string>
}

export function AiChatPanel({ page, provider, onClose, onAsk }: AiChatPanelProps): JSX.Element {
  const [entries, setEntries] = useState<readonly ChatEntry[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const question = input.trim()
    if (!question || sending) return
    const history = entries.map(({ role, content }) => ({ role, content }))
    const user: ChatEntry = { id: crypto.randomUUID(), role: "user", content: question }
    setEntries((current) => [...current, user])
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
    <aside className="ai-chat-sidebar" aria-label="논문 AI 에이전트">
      <header className="ai-chat-head">
        <div className="ai-chat-title">
          <span className="ai-chat-logo">
            <Sparkles size={15} />
          </span>
          <div>
            <strong>Ask Scourgify</strong>
            <span>논문 AI 어시스턴트</span>
          </div>
        </div>
        <button
          type="button"
          className="ai-chat-back"
          aria-label="보드 바로가기로 전환"
          onClick={onClose}
        >
          <LayoutGrid size={14} /> 보드
        </button>
      </header>
      <div className="ai-chat-context">
        <span>p.{page}</span>
        <span>{provider.provider}</span>
        <span title={provider.model}>{provider.model}</span>
      </div>
      <div className="ai-chat-messages" aria-live="polite">
        {entries.length === 0 ? (
          <div className="ai-chat-empty">
            <span className="ai-chat-empty-icon">
              <Bot size={22} />
            </span>
            <strong>논문과 대화하기</strong>
            <p>현재 문서의 방법, 수식, 표와 실험 결과를 근거로 답합니다.</p>
            <div className="ai-chat-suggestions">
              {["핵심 기여 요약", "현재 페이지 설명", "한계와 후속 연구"].map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} data-role={entry.role}>
              <strong>{entry.role === "user" ? "나" : "Scourgify"}</strong>
              <p>{entry.content}</p>
            </article>
          ))
        )}
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <textarea
          aria-label="논문 질문"
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder="이 논문의 핵심 기여가 뭐야?"
          rows={2}
        />
        <button type="submit" disabled={!input.trim() || sending}>
          <Send size={15} /> {sending ? "답변 중" : "보내기"}
        </button>
      </form>
    </aside>
  )
}
