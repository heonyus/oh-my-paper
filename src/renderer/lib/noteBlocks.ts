import type { Editor } from "@tiptap/react"

/** The last few note lines above a block, which tell the tutor where the paragraph came from. */
export function earlierLines(editor: Editor, before: number): string {
  const lines: string[] = []
  editor.state.doc.descendants((node, pos) => {
    if (pos >= before) return false
    if (!node.isTextblock) return true
    const text = node.textContent.trim()
    if (text) lines.push(text)
    return false
  })
  return lines.slice(-3).join("\n")
}

/** Whether a block with exactly this text is still in the note. */
export function hasTextBlock(editor: Editor, text: string): boolean {
  let found = false
  editor.state.doc.descendants((node) => {
    if (found) return false
    if (!node.isTextblock) return true
    found = node.textContent.trim() === text
    return false
  })
  return found
}
