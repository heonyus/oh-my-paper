import { type FormEvent, type JSX, useCallback, useEffect, useRef, useState } from "react"
import type { AiHistoryMessage, ProviderStatus } from "../../shared/ipc"
import type { SourceCitation } from "../lib/chatCitations"
import { type ChatImage, chatImageFromFile } from "../lib/chatImage"
import { PaperAiJobError } from "../lib/usePaperAiRequest"
import type { AiDeltaHandler } from "../types"
import { ChatComposer } from "./ChatComposer"
import { MarkdownContent } from "./MarkdownContent"

/** `image` lives only in memory; storage keeps just the `attachment` marker. */
type ChatEntry = AiHistoryMessage & {
  readonly id: string
  readonly image?: string | undefined
  readonly attachment?: "image" | undefined
}

const imageOnlyQuestion = "첨부한 이미지를 이 논문 내용과 연결해 설명해 주세요."

const MAX_PERSISTED_ENTRIES = 60

export function paperDiscussionStorageKey(documentId: string): string {
  return `ohmypaper:discussion:${documentId}`
}

function loadEntries(documentId: string): readonly ChatEntry[] {
  try {
    const raw = window.localStorage.getItem(paperDiscussionStorageKey(documentId))
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
      .map((entry) =>
        entry.role === "assistant" &&
        /^(?:답변 작성 중…|논문 근거를 확인하는 중…)$/u.test(entry.content.trim())
          ? { ...entry, content: "중단되었습니다." }
          : entry.content.trim().length === 0
            ? { ...entry, content: "중단되었습니다." }
            : entry,
      )
  } catch {
    return []
  }
}

export function PaperDiscussion({
  provider,
  documentId,
  onAsk,
  onNavigateToSource,
}: {
  readonly provider: ProviderStatus
  readonly documentId: string
  readonly onNavigateToSource?: ((citation: SourceCitation) => void) | undefined
  readonly onAsk: (
    question: string,
    history: readonly AiHistoryMessage[],
    onDelta?: AiDeltaHandler,
    signal?: AbortSignal,
    imageDataUrl?: string,
  ) => Promise<string>
}): JSX.Element {
  const [entries, setEntries] = useState<readonly ChatEntry[]>(() => loadEntries(documentId))
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [image, setImage] = useState<ChatImage | null>(null)
  const [imageError, setImageError] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  // A stable handler keeps Markdown from remounting every answer when parents re-render.
  const navigateRef = useRef(onNavigateToSource)
  navigateRef.current = onNavigateToSource
  const navigateToSource = useCallback(
    (citation: SourceCitation) => navigateRef.current?.(citation),
    [],
  )
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    setEntries(loadEntries(documentId))
  }, [documentId])
  useEffect(() => {
    try {
      window.localStorage.setItem(
        paperDiscussionStorageKey(documentId),
        JSON.stringify(
          entries
            .filter((entry) => entry.content !== "")
            .slice(-MAX_PERSISTED_ENTRIES)
            .map(({ id, role, content, attachment }) =>
              attachment ? { id, role, content, attachment } : { id, role, content },
            ),
        ),
      )
    } catch {
      // storage full or unavailable — chat stays session-scoped
    }
  }, [documentId, entries])

  function selectImage(file: File): void {
    setImageError("")
    chatImageFromFile(file)
      .then(setImage)
      .catch((error: unknown) =>
        setImageError(error instanceof Error ? error.message : "이미지를 첨부하지 못했습니다"),
      )
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const attached = image
    const question = input.trim() || (attached ? imageOnlyQuestion : "")
    if (!question || sending) return
    const history = entries.map(({ role, content }) => ({ role, content }))
    const answerId = crypto.randomUUID()
    setEntries((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        ...(attached ? { image: attached.dataUrl, attachment: "image" as const } : {}),
      },
      { id: answerId, role: "assistant", content: "" },
    ])
    setInput("")
    setImage(null)
    setImageError("")
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
        attached?.dataUrl,
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
                <strong>{entry.role === "user" ? "나" : "oh-my-paper"}</strong>
                {entry.image ? (
                  <img className="discussion-image" src={entry.image} alt="첨부 이미지" />
                ) : entry.attachment === "image" ? (
                  <span className="discussion-attachment">이미지 첨부</span>
                ) : null}
                <MarkdownContent
                  source={entry.content}
                  onCitation={
                    entry.role === "assistant" && onNavigateToSource ? navigateToSource : undefined
                  }
                />
              </article>
            ))
          : null}
      </div>
      {imageError ? (
        <p className="discussion-image-error" role="alert">
          {imageError}
        </p>
      ) : null}
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
        image={image}
        onImageSelect={selectImage}
        onImageRemove={() => setImage(null)}
      />
    </section>
  )
}
