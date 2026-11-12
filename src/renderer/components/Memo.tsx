import { type ComponentProps, type JSX, useLayoutEffect, useMemo, useRef, useState } from "react"
import { MemoEditor, type MemoFocusPoint } from "./MemoEditor"
import { renderMemoPreview } from "./memoPreview"

/** Where the caret goes when a memo turns into its editor. */
type MemoEntry = { readonly at: MemoFocusPoint | null }

/**
 * A memo's text, drawn as its editor would draw it but without one. Clicking it, or reaching it
 * with the keyboard, asks for the editor.
 */
function MemoPreview({
  content,
  ariaLabel,
  onEdit,
}: {
  readonly content: DocumentFragment
  readonly ariaLabel: string
  readonly onEdit: (entry: MemoEntry) => void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  // Focus arrives with the press of a click, before the click says where the caret should go.
  const pressed = useRef(false)

  useLayoutEffect(() => {
    host.current?.replaceChildren(content.cloneNode(true))
  }, [content])

  return (
    <div className="memo-editor">
      {/* biome-ignore lint/a11y/useSemanticElements: it stands in for the rich-text editor it becomes when focused, which no input element can show. */}
      <div
        ref={host}
        className="note-prose memo-prose memo-preview"
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerDown={() => {
          pressed.current = true
        }}
        onFocus={() => {
          if (!pressed.current) onEdit({ at: null })
        }}
        onClick={(event) => {
          pressed.current = false
          // A link in a memo is text to edit, as it is in the editor, not somewhere to go.
          event.preventDefault()
          // Text dragged over is being copied; the next click edits.
          const selection = window.getSelection()
          if (selection && !selection.isCollapsed && host.current?.contains(selection.anchorNode))
            return
          onEdit({ at: { x: event.clientX, y: event.clientY } })
        }}
        onAuxClick={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEdit({ at: null })
        }}
      />
    </div>
  )
}

/**
 * A memo left on the board. Each memo used to start a whole editor the moment its card was
 * drawn, the costliest thing on the board, though most memos on a paper are only read. It is
 * now drawn as plain elements that look the same, and becomes the editor, caret where the
 * click landed, when the reader goes to write in it. A memo opened to be written (`autoFocus`)
 * is the editor from the start.
 */
export function Memo(props: ComponentProps<typeof MemoEditor>): JSX.Element {
  const [entry, setEntry] = useState<MemoEntry | null>(props.autoFocus ? { at: null } : null)
  const preview = useMemo(
    () => (entry ? null : renderMemoPreview(props.markdown, props.placeholder)),
    [entry, props.markdown, props.placeholder],
  )
  if (!entry && preview)
    return <MemoPreview content={preview} ariaLabel={props.ariaLabel} onEdit={setEntry} />
  return (
    <MemoEditor
      {...props}
      autoFocus={props.autoFocus || (entry !== null && entry.at === null)}
      focusAt={entry?.at ?? undefined}
    />
  )
}
