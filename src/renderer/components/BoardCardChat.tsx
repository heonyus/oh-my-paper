import { type FormEvent, type JSX, useState } from "react"
import { withinCardChatLimits } from "../lib/cardChatLimits"
import type { AiDeltaHandler, BoardCard } from "../types"
import { ChatComposer } from "./ChatComposer"
import { MarkdownContent } from "./MarkdownContent"

export function BoardCardChat({
  card,
  onChange,
  onAsk,
}: {
  readonly card: BoardCard
  readonly onChange: (messages: BoardCard["chat"]) => void
  readonly onAsk: (
    question: string,
    history: BoardCard["chat"],
    onDelta?: AiDeltaHandler,
  ) => Promise<string>
}): JSX.Element {
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [streamedAnswer, setStreamedAnswer] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const question = input.trim()
    if (!question || sending) return
    const withQuestion = withinCardChatLimits([...card.chat, { role: "user", content: question }])
    onChange(withQuestion)
    setInput("")
    setStreamedAnswer("")
    setSending(true)
    try {
      const answer = await onAsk(question, withQuestion, (delta) =>
        setStreamedAnswer((current) => current + delta),
      )
      onChange(withinCardChatLimits([...withQuestion, { role: "assistant", content: answer }]))
      setStreamedAnswer("")
    } catch {
      onChange(
        withinCardChatLimits([
          ...withQuestion,
          { role: "assistant", content: "AI 설정을 확인한 뒤 다시 보내주세요." },
        ]),
      )
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
      {streamedAnswer ? (
        <div className="card-chat-history" aria-live="polite">
          <article data-role="assistant" data-streaming="true">
            <p>{streamedAnswer}</p>
          </article>
        </div>
      ) : null}
      <ChatComposer
        label="카드에 후속 질문"
        submitLabel="후속 질문 보내기"
        value={input}
        sending={sending}
        responseStarted={streamedAnswer.length > 0}
        onChange={setInput}
        onSubmit={(event) => void submit(event)}
      />
    </section>
  )
}
