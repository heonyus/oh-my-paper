import type { Editor } from "@tiptap/core"

/**
 * The note's Markdown as the file keeps it. A list's stand-in line, which lets its first item
 * indent, comes out of the editor as a bare marker, and a bare marker under a line of text
 * reads back as a heading underline. An empty comment after it keeps it an empty item, which
 * reads back as the same hidden line.
 */
export function noteMarkdown(editor: Editor): string {
  return editor.getMarkdown().replace(/^(\s*(?:[-*+]|\d+[.)])) *$/gmu, "$1 <!-- -->")
}
