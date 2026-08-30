import { type FormEvent, type JSX, useState } from "react"
import type { AiHistoryMessage, ProviderStatus } from "../../shared/ipc"
import { ChatComposer } from "./ChatComposer"
import { MarkdownContent } from "./MarkdownContent"

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
        {entries.length > 0
          ? entries.map((entry) => (
              <article key={entry.id} data-role={entry.role}>
                <strong>{entry.role === "user" ? "나" : "Scourgify"}</strong>
                <MarkdownContent source={entry.content} />
              </article>
            ))
          : null}
      </div>
      <ChatComposer
        label="논문 토론 질문"
        submitLabel="토론 질문 보내기"
        value={input}
        sending={sending}
        model={provider.model}
        onChange={setInput}
        onSubmit={(event) => void submit(event)}
      />
    </section>
  )
}
