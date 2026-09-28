const SNIPPET_CHARACTERS = 220
/** A Markdown link whose target may hold one level of parentheses, as DOIs and titles do. */
const MARKDOWN_LINK = /\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))*\)/gu

/**
 * A short Markdown excerpt for a margin card: links read as their label, and the cut never falls
 * inside inline math.
 */
export function marginSnippet(markdown: string): string {
  const text = markdown.replace(MARKDOWN_LINK, "$1")
  if (text.length <= SNIPPET_CHARACTERS) return text
  let cut = text.slice(0, SNIPPET_CHARACTERS)
  // An odd count of `$` means the cut fell inside inline math: end before that math opens.
  if ((cut.match(/\$/gu)?.length ?? 0) % 2 === 1) cut = cut.slice(0, cut.lastIndexOf("$"))
  return `${cut.trim()}…`
}
