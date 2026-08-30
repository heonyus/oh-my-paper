import { type FormEvent, type JSX, useState } from "react"
import type { BoardCard } from "../types"
import { ChatComposer } from "./ChatComposer"
import { MarkdownContent } from "./MarkdownContent"

export function BoardCardChat({
  card,
  onChange,
  onAsk,
}: {
  readonly card: BoardCard
  readonly onChange: (messages: BoardCard["chat"]) => void
  readonly onAsk: (question: string, history: BoardCard["chat"]) => Promise<string>
}): JSX.Element {
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const question = input.trim()
    if (!question || sending) return
    const withQuestion: BoardCard["chat"] = [...card.chat, { role: "user", content: question }]
    onChange(withQuestion)
    setInput("")
    setSending(true)
    try {
      const answer = await onAsk(question, withQuestion)
      onChange([...withQuestion, { role: "assistant", content: answer }])
    } catch {
      onChange([
        ...withQuestion,
        { role: "assistant", content: "AI 설정을 확인한 뒤 다시 보내주세요." },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card-chat" aria-label="카드 후속 질문">
      {card.chat.length > 0 ? (
        <div className="card-chat-history" aria-live="polite">
          {card.chat.map((message) => (
            <article key={`${message.role}-${message.content}`} data-role={message.role}>
              <MarkdownContent source={message.content} />
            </article>
          ))}
        </div>
      ) : null}
      <ChatComposer
        label="카드에 후속 질문"
        submitLabel="후속 질문 보내기"
        value={input}
        sending={sending}
        onChange={setInput}
        onSubmit={(event) => void submit(event)}
      />
    </section>
  )
}
