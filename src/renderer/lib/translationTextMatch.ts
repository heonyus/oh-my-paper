import { canonicalCharacters } from "./pageTranslationSpanMapping"

type TextBlock = {
  readonly id: string
  readonly source: string
  readonly translation: string
}

type Owner = {
  readonly character: string
  readonly node: Text
  readonly offset: number
  readonly length: number
}

/** A highlight and a sentence overlap by at least this many letters to count as the same text. */
const overlapMin = 12
/** A highlight inside one sentence is at least this long, so "is" does not light the page. */
const containedMin = 4

/** Letters and digits only, link targets dropped, so markdown and the text it renders compare alike. */
export function canonicalText(text: string): string {
  return canonicalCharacters(text.replace(/\]\([^)]*\)/gu, "]")).join("")
}

/** Source text as the reader sees it: a citation link keeps its label, not its target. */
export function plainSource(source: string): string {
  return source
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim()
}

/**
 * The blocks a selection inside one article covers, found by placing the selected text in
 * the article's translations or, when the reader selected source text, its sources. All of
 * them when the text cannot be placed (typeset math reads differently from its markdown).
 */
export function coveredBlocks<T extends TextBlock>(
  blocks: readonly T[],
  selected: string,
): readonly T[] {
  const key = canonicalText(selected)
  if (key.length === 0) return blocks
  for (const field of ["translation", "source"] as const) {
    const parts = blocks.map((block) => canonicalText(block[field]))
    const start = parts.join("").indexOf(key)
    if (start < 0) continue
    const end = start + key.length
    let offset = 0
    const covered = blocks.filter((_block, index) => {
      const from = offset
      offset += parts[index]?.length ?? 0
      return offset > from && from < end && offset > start
    })
    if (covered.length > 0) return covered
  }
  return blocks
}

/**
 * Whether a highlight's quote takes in a sentence: the whole sentence, the quote inside it,
 * or the quote starting or ending partway through it.
 */
export function quoteCoversText(quote: string, text: string): boolean {
  const key = canonicalText(quote)
  const sentence = canonicalText(text)
  if (key.length === 0 || sentence.length === 0) return false
  if (sentence.length <= key.length) {
    if (key.includes(sentence)) return true
  } else if (key.length >= containedMin && sentence.includes(key)) return true
  const longest = Math.min(key.length, sentence.length)
  for (let length = longest; length >= overlapMin; length -= 1) {
    if (key.startsWith(sentence.slice(-length)) || key.endsWith(sentence.slice(0, length)))
      return true
  }
  return false
}

function hiddenMath(node: Text): boolean {
  return node.parentElement?.closest(".katex-mathml") !== null
}

/** Every letter and digit under `roots`, in order, with the text node and offset it sits at. */
export function textOwners(roots: readonly Node[]): readonly Owner[] {
  const owners: Owner[] = []
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text) || hiddenMath(node)) continue
      let offset = 0
      for (const character of node.data) {
        for (const folded of canonicalCharacters(character))
          owners.push({ character: folded, node, offset, length: character.length })
        offset += character.length
      }
    }
  }
  return owners
}

/** The range of `owners` spelling `needle` (a canonical text), or null when it is not there. */
export function rangeOfOwners(owners: readonly Owner[], needle: string): Range | null {
  if (needle.length === 0) return null
  const start = owners
    .map((owner) => owner.character)
    .join("")
    .indexOf(needle)
  if (start < 0) return null
  const first = owners[start]
  const last = owners[start + needle.length - 1]
  if (!first || !last) return null
  const range = document.createRange()
  range.setStart(first.node, first.offset)
  range.setEnd(last.node, last.offset + last.length)
  return range
}

/** Where `needle` (a canonical text) is written under `root`. */
export function textRangeIn(root: Node, needle: string): Range | null {
  return rangeOfOwners(textOwners([root]), needle)
}

/** The part of `range` that lies inside `element`, as text. */
export function textWithin(range: Range, element: Element): string {
  const scoped = document.createRange()
  scoped.selectNodeContents(element)
  if (range.compareBoundaryPoints(Range.START_TO_START, scoped) > 0)
    scoped.setStart(range.startContainer, range.startOffset)
  if (range.compareBoundaryPoints(Range.END_TO_END, scoped) < 0)
    scoped.setEnd(range.endContainer, range.endOffset)
  return scoped.toString()
}
