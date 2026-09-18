import { type FormEvent, type JSX, useEffect, useRef, useState } from "react"
import type { AiHistoryMessage, ProviderStatus } from "../../shared/ipc"
import { PaperAiJobError } from "../lib/usePaperAiRequest"
import type { AiDeltaHandler } from "../types"
import { ChatComposer } from "./ChatComposer"
import { MarkdownContent } from "./MarkdownContent"

type ChatEntry = AiHistoryMessage & { readonly id: string }

const MAX_PERSISTED_ENTRIES = 60

function storageKey(documentId: string): string {
  return `scourgify:discussion:${documentId}`
}

function loadEntries(documentId: string): readonly ChatEntry[] {
  try {
    const raw = window.localStorage.getItem(storageKey(documentId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (entry): entry is ChatEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as ChatEntry).id === "string" &&
          ((entry as ChatEntry).role === "user" || (entry as ChatEntry).role === "assistant") &&
          typeof (entry as ChatEntry).content === "string",
      )
      .slice(-MAX_PERSISTED_ENTRIES)
  } catch {
    return []
  }
}

export function PaperDiscussion({
  provider,
  documentId,
  onAsk,
}: {
  readonly provider: ProviderStatus
  readonly documentId: string
  readonly onAsk: (
    question: string,
    history: readonly AiHistoryMessage[],
    onDelta?: AiDeltaHandler,
    signal?: AbortSignal,
  ) => Promise<string>
}): JSX.Element {
  const [entries, setEntries] = useState<readonly ChatEntry[]>(() => loadEntries(documentId))
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    setEntries(loadEntries(documentId))
  }, [documentId])
  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey(documentId),
        JSON.stringify(
          entries.filter((entry) => entry.content !== "").slice(-MAX_PERSISTED_ENTRIES),
        ),
      )
    } catch {
      // storage full or unavailable — chat stays session-scoped
    }
  }, [documentId, entries])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const question = input.trim()
    if (!question || sending) return
    const history = entries.map(({ role, content }) => ({ role, content }))
    const answerId = crypto.randomUUID()
    setEntries((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: question },
      { id: answerId, role: "assistant", content: "" },
    ])
    setInput("")
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const answer = await onAsk(
        question,
        history,
        (delta) =>
          setEntries((current) =>
            current.map((entry) =>
              entry.id === answerId ? { ...entry, content: entry.content + delta } : entry,
            ),
          ),
        controller.signal,
      )
      setEntries((current) =>
        current.map((entry) => (entry.id === answerId ? { ...entry, content: answer } : entry)),
      )
    } catch (error) {
      const cancelled = error instanceof PaperAiJobError && error.code === "cancelled"
      setEntries((current) =>
        current.map((entry) =>
          entry.id === answerId
            ? {
                ...entry,
                content: cancelled
                  ? entry.content
                    ? `${entry.content}\n\n*(중단됨)*`
                    : "중단되었습니다."
                  : "AI provider 설정을 확인한 뒤 다시 보내주세요.",
              }
            : entry,
        ),
      )
    } finally {
      abortRef.current = null
      setSending(false)
    }
  }

  return (
    <section className="discussion-section" aria-label="논문 토론">
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
        responseStarted={Boolean(entries.at(-1)?.content)}
        model={provider.model}
        onChange={setInput}
        onSubmit={(event) => void submit(event)}
        onCancel={() => abortRef.current?.abort()}
      />
    </section>
  )
}
