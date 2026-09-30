import { type FormEvent, type JSX, useCallback, useEffect, useRef, useState } from "react"
import type { AiHistoryMessage, ProviderStatus } from "../../shared/ipc"
import type { SourceCitation } from "../lib/chatCitations"
import { type ChatImage, chatImageFromFile } from "../lib/chatImage"
import { useLocale, useTranslator } from "../lib/locale"
import { PaperAiJobError } from "../lib/usePaperAiRequest"
import { researchMessages } from "../messages/research"
import type { AiDeltaHandler } from "../types"
import { ChatComposer } from "./ChatComposer"
import { MarkdownContent } from "./MarkdownContent"

/** `image` lives only in memory; storage keeps just the `attachment` marker. */
type ChatEntry = AiHistoryMessage & {
  readonly id: string
  readonly image?: string | undefined
  readonly attachment?: "image" | undefined
}

// Sent to the model as the question, so it stays as written whatever the app's language.
const imageOnlyQuestion = "첨부한 이미지를 이 논문 내용과 연결해 설명해 주세요."

const MAX_PERSISTED_ENTRIES = 60

export function paperDiscussionStorageKey(documentId: string): string {
  return `ohmypaper:discussion:${documentId}`
}

/** `stopped` replaces answers that were cut off before they finished. */
function loadEntries(documentId: string, stopped: string): readonly ChatEntry[] {
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
          ? { ...entry, content: stopped }
          : entry.content.trim().length === 0
            ? { ...entry, content: stopped }
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
  const t = useTranslator(researchMessages)
  const { locale } = useLocale()
  // Read through a ref so a language switch does not reload the conversation.
  const stoppedRef = useRef(t("discussion.stopped"))
  stoppedRef.current = t("discussion.stopped")
  const [entries, setEntries] = useState<readonly ChatEntry[]>(() =>
    loadEntries(documentId, stoppedRef.current),
  )
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
    setEntries(loadEntries(documentId, stoppedRef.current))
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
    chatImageFromFile(file, locale)
      .then(setImage)
      .catch((error: unknown) =>
        setImageError(error instanceof Error ? error.message : t("discussion.imageFailed")),
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
                    ? `${entry.content}\n\n${t("discussion.stoppedMark")}`
                    : t("discussion.stopped")
                  : t("discussion.providerError"),
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
    <section className="discussion-section" aria-label={t("discussion.label")}>
      <div className="discussion-messages" aria-live="polite">
        {entries.length > 0
          ? entries.map((entry) => (
              <article key={entry.id} data-role={entry.role}>
                <strong>{entry.role === "user" ? t("discussion.you") : "oh-my-paper"}</strong>
                {entry.image ? (
                  <img
                    className="discussion-image"
                    src={entry.image}
                    alt={t("discussion.imageAlt")}
                  />
                ) : entry.attachment === "image" ? (
                  <span className="discussion-attachment">{t("discussion.imageAttached")}</span>
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
        label={t("discussion.inputLabel")}
        submitLabel={t("discussion.submit")}
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
