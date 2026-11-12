import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "@tiptap/markdown"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { type JSX, useCallback, useEffect, useRef } from "react"
import { MathNode } from "./readerNote/mathNode"
import { noteMarkdown } from "./readerNote/noteMarkdown"

/** Typing settles into the card after a short pause instead of on every keystroke. */
const SAVE_DELAY_MS = 400

/**
 * A memo written in Markdown and shown rendered while it is written: `# ` turns into a heading,
 * `**bold**` into bold, `- ` into a list and `$x$` into a formula as they are typed. There is no
 * separate save: the Markdown reaches `onChange` after a pause, on blur, and when it closes.
 */
export function MemoEditor({
  markdown,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus = false,
  focusRequest = 0,
  maxLength,
  onSubmit,
  onEscape,
}: {
  readonly markdown: string
  readonly onChange: (markdown: string) => void
  readonly placeholder: string
  readonly ariaLabel: string
  readonly autoFocus?: boolean | undefined
  /** Each change moves the caret to the end of the memo. */
  readonly focusRequest?: number | undefined
  readonly maxLength?: number | undefined
  /** Ctrl/⌘+Enter. */
  readonly onSubmit?: ((markdown: string) => void) | undefined
  readonly onEscape?: (() => void) | undefined
}): JSX.Element {
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<string | null>(null)
  // The Markdown this editor last handed out, so a body echoed back is not loaded over the caret.
  const emitted = useRef(markdown)
  const callbacks = useRef({ onChange, onSubmit, onEscape, maxLength })
  callbacks.current = { onChange, onSubmit, onEscape, maxLength }

  const flush = useCallback((): void => {
    window.clearTimeout(saveTimer.current)
    if (pending.current === null) return
    const next = pending.current
    pending.current = null
    callbacks.current.onChange(next)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: () => placeholder }),
      Markdown,
      MathNode,
    ],
    content: markdown,
    contentType: "markdown",
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: "note-prose memo-prose",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
      },
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          flush()
          const submit = callbacks.current.onSubmit
          if (submit) submit(emitted.current)
          else view.dom.blur()
          return true
        }
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          flush()
          if (callbacks.current.onEscape) callbacks.current.onEscape()
          else view.dom.blur()
          return true
        }
        return false
      },
      handleTextInput: (view, _from, _to, text) => {
        const limit = callbacks.current.maxLength
        return limit !== undefined && view.state.doc.textContent.length + text.length > limit
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = noteMarkdown(current)
      emitted.current = next
      pending.current = next
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, SAVE_DELAY_MS)
    },
    onBlur: flush,
  })

  // A body changed from outside (another window, undo on the board) replaces the memo.
  useEffect(() => {
    if (!editor || markdown === emitted.current) return
    emitted.current = markdown
    pending.current = null
    window.clearTimeout(saveTimer.current)
    editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false })
  }, [editor, markdown])

  useEffect(() => {
    if (editor && (autoFocus || focusRequest > 0)) editor.commands.focus("end")
  }, [editor, autoFocus, focusRequest])

  useEffect(() => flush, [flush])

  return <EditorContent editor={editor} className="memo-editor" />
}
