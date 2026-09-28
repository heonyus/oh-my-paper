import DragHandle from "@tiptap/extension-drag-handle-react"
import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "@tiptap/markdown"
import { type Editor, EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { GripVertical } from "lucide-react"
import { type JSX, useCallback, useEffect, useMemo, useRef } from "react"
import { EvidenceNode } from "./evidenceNode"
import { SlashMenu } from "./SlashMenu"
import { SlashMenuStore, slashCommandExtension } from "./slashCommands"

/** Typing settles into the workspace after a short pause instead of on every keystroke. */
const SAVE_DELAY_MS = 400

/**
 * The reader's note: a block editor over plain Markdown. `/` opens block choices,
 * blocks can be dragged, and evidence chips open their source passage.
 */
export function ReaderNoteEditor({
  initialMarkdown,
  onMarkdownChange,
  onEditorChange,
  onOpenEvidence,
}: {
  readonly initialMarkdown: string
  readonly onMarkdownChange: (markdown: string) => void
  readonly onEditorChange: (editor: Editor | null) => void
  readonly onOpenEvidence: (page: number, quote: string) => void
}): JSX.Element {
  const slashMenu = useMemo(() => new SlashMenuStore(), [])
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<string | null>(null)
  const callbacks = useRef({ onMarkdownChange, onOpenEvidence })
  callbacks.current = { onMarkdownChange, onOpenEvidence }

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
            ? "제목"
            : "내 말로 적어보세요. / 를 누르면 블록을 고를 수 있어요",
      }),
      Markdown,
      EvidenceNode,
      slashCommandExtension(slashMenu),
    ],
    content: initialMarkdown,
    contentType: "markdown",
    immediatelyRender: true,
    editorProps: {
      attributes: { class: "note-prose", "aria-label": "내 노트 본문" },
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
    <div className="note-editor">
      <DragHandle editor={editor} className="note-drag-handle">
        <GripVertical size={14} aria-hidden="true" />
      </DragHandle>
      <EditorContent editor={editor} />
      <SlashMenu store={slashMenu} />
    </div>
  )
}
