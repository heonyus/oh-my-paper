export type KeywordEntry = { readonly term: string; readonly definition: string }

/** `- **TERM**: definition`, also with the colon inside the bold or a dash for it. */
const keywordLine =
  /^\s*(?:[-*+]|\d+[.)])\s+\*\*([^*]+?)\s*(?:[:：]\s*\*\*|\*\*\s*[:：—–-])\s*(.+?)\s*$/u

/** The keyword answer's term bullets; any heading or prose around them is left out. */
export function keywordEntries(markdown: string): readonly KeywordEntry[] {
  return markdown.split("\n").flatMap((line) => {
    const match = keywordLine.exec(line)
    const term = match?.[1]?.trim()
    const definition = match?.[2]?.trim()
    return term && definition ? [{ term, definition }] : []
  })
}
