import DragHandle from "@tiptap/extension-drag-handle-react"
import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "@tiptap/markdown"
import { type Editor, EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { GripVertical } from "lucide-react"
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocale, useTranslator } from "../../lib/locale"
import { noteMessages } from "../../messages/note"
import { EvidenceNode } from "./evidenceNode"
import { ArrowInput, type MarginSlotRegistry, marginSlotsExtension } from "./marginSlots"
import { NoteImage } from "./noteImage"
import { SlashMenu } from "./SlashMenu"
import { SlashMenuStore, slashCommandExtension } from "./slashCommands"

/** Typing settles into the workspace after a short pause instead of on every keystroke. */
const SAVE_DELAY_MS = 400
const IMAGE_ERROR_MS = 5000

/**
 * The reader's note: a block editor over plain Markdown. `/` opens block choices,
 * blocks can be dragged, and evidence chips open their source passage.
 */
export function ReaderNoteEditor({
  initialMarkdown,
  onMarkdownChange,
  onEditorChange,
  onOpenEvidence,
  marginSlots,
}: {
  readonly initialMarkdown: string
  readonly onMarkdownChange: (markdown: string) => void
  readonly onEditorChange: (editor: Editor | null) => void
  readonly onOpenEvidence: (page: number, quote: string) => void
  /** Where the margin's cards show, right under the block they answer. */
  readonly marginSlots?: MarginSlotRegistry | undefined
}): JSX.Element {
  const slashMenu = useMemo(() => new SlashMenuStore(), [])
  const root = useRef<HTMLDivElement>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const imageErrorTimer = useRef<number | undefined>(undefined)
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<string | null>(null)
  const callbacks = useRef({ onMarkdownChange, onOpenEvidence })
  callbacks.current = { onMarkdownChange, onOpenEvidence }
  // The editor's extensions are made once; they read the reader's language through these refs.
  const { locale } = useLocale()
  const t = useTranslator(noteMessages)
  const language = useRef({ locale, t })
  language.current = { locale, t }

  const reportImageError = useCallback((error: unknown): void => {
    const reason =
      error instanceof Error
        ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, "")
        : ""
    setImageError(
      reason
        ? `${language.current.t("image.failed")}: ${reason}`
        : language.current.t("image.failed"),
    )
    window.clearTimeout(imageErrorTimer.current)
    imageErrorTimer.current = window.setTimeout(() => setImageError(null), IMAGE_ERROR_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(imageErrorTimer.current), [])

  const flush = useCallback((): void => {
    window.clearTimeout(saveTimer.current)
    if (pending.current === null) return
    callbacks.current.onMarkdownChange(pending.current)
    pending.current = null
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? language.current.t("editor.headingPlaceholder")
            : language.current.t("editor.placeholder"),
      }),
      Markdown,
      EvidenceNode,
      ArrowInput,
      NoteImage.configure({ onError: reportImageError }),
      ...(marginSlots ? [marginSlotsExtension(marginSlots)] : []),
      slashCommandExtension(slashMenu, () => language.current.locale),
    ],
    content: initialMarkdown,
    contentType: "markdown",
    immediatelyRender: true,
    editorProps: {
      attributes: { class: "note-prose", "aria-label": t("editor.body") },
      handleClickOn: (_view, _pos, node) => {
        if (node.type.name !== "evidence") return false
        callbacks.current.onOpenEvidence(
          Number(Reflect.get(node.attrs, "page")),
          String(Reflect.get(node.attrs, "quote")),
        )
        return true
      },
    },
    onUpdate: ({ editor: current }) => {
      pending.current = current.getMarkdown()
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, SAVE_DELAY_MS)
    },
    onBlur: flush,
  })

  useEffect(() => {
    onEditorChange(editor)
    return () => {
      flush()
      onEditorChange(null)
    }
  }, [editor, onEditorChange, flush])

  return (
    <div ref={root} className="note-editor">
      <DragHandle editor={editor} className="note-drag-handle">
        <GripVertical size={14} aria-hidden="true" />
      </DragHandle>
      <EditorContent editor={editor} />
      {imageError ? (
        <p className="note-image-error" role="alert">
          {imageError}
        </p>
      ) : null}
      <SlashMenu store={slashMenu} anchor={root} />
    </div>
  )
}
