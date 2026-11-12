type SourceBox = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type SourceSpanBlock = {
  readonly id: string
  readonly source: string
  readonly sourceBounds?: SourceBox
  readonly sourceParts?: readonly SourceBox[]
  readonly sourcePageWidth?: number
  readonly sourcePageHeight?: number
}

type CharacterOwner = {
  readonly character: string
  readonly element: HTMLElement
  /** Where the character came from in the element's text, when that can be told. */
  readonly at: TextExtent | null
}

/** A stretch of an element's text, in UTF-16 offsets into its `textContent`. */
type TextExtent = { readonly start: number; readonly end: number }

const comparableCharacter = /[\p{L}\p{N}]/u
/** A character with the marks set on it, which fold together. */
const markedCharacter = /\P{M}\p{M}*|\p{M}+/gu
const closingPunctuation = /[.,;:!?)\]}”’"'%…]/u
const openingPunctuation = /[([{“‘"']/u

/** The letters and digits of `value`, folded, so text compares the same however it is set. */
export function canonicalCharacters(value: string): readonly string[] {
  return [...value.normalize("NFKC").toLocaleLowerCase()].filter((character) =>
    comparableCharacter.test(character),
  )
}

/**
 * `canonicalCharacters` with the place each one came from. Null when folding the text piece by
 * piece does not give what folding it whole does, so the places cannot be trusted.
 */
function locatedCharacters(value: string): readonly (TextExtent & { character: string })[] | null {
  const located: (TextExtent & { character: string })[] = []
  for (const piece of value.matchAll(markedCharacter)) {
    const start = piece.index
    const end = start + piece[0].length
    for (const character of canonicalCharacters(piece[0])) located.push({ character, start, end })
  }
  const whole = canonicalCharacters(value)
  return located.length === whole.length &&
    located.every((entry, index) => entry.character === whole[index])
    ? located
    : null
}

/**
 * The part of each text-layer span that belongs to each block bound to it. A span is a run of
 * a line and a sentence seldom ends where a line does, so a span usually carries the end of one
 * sentence and the start of the next; this is what tells them apart.
 */
const extentsOfSpan = new WeakMap<HTMLElement, Map<string, TextExtent>>()

/** Widens a sentence's letters to the punctuation that closes and opens it. */
function withPunctuation(text: string, extent: TextExtent): TextExtent {
  let { start, end } = extent
  while (end < text.length && closingPunctuation.test(text.charAt(end))) end += 1
  while (start > 0 && openingPunctuation.test(text.charAt(start - 1))) start -= 1
  return { start, end }
}

/** The DOM range over `extent` of the element's text, or null when its text has changed. */
function rangeOver(element: HTMLElement, extent: TextExtent): Range | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let before = 0
  let started = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!started && extent.start < before + length) {
      range.setStart(node, extent.start - before)
      started = true
    }
    if (started && extent.end <= before + length) {
      range.setEnd(node, extent.end - before)
      return range
    }
    before += length
  }
  return null
}

/** The text of `element` that is `blockId`'s, or null when only the whole span is known to be. */
export function sourceTextRange(element: HTMLElement, blockId: string): Range | null {
  const extent = extentsOfSpan.get(element)?.get(blockId)
  return extent ? rangeOver(element, extent) : null
}

/** Whether every block bound to `element` has its own part of the text marked out. */
export function sourceTextIsExact(element: HTMLElement): boolean {
  const extents = extentsOfSpan.get(element)
  const ids = element.getAttribute("data-page-translation-block")?.split(",").filter(Boolean) ?? []
  return Boolean(extents) && ids.length > 0 && ids.every((id) => extents?.has(id))
}

export function forgetSourceText(element: HTMLElement): void {
  extentsOfSpan.delete(element)
}

/** How far into `element`'s text the point on screen falls, where the browser can say. */
function textOffsetAt(
  element: HTMLElement,
  point: { readonly x: number; readonly y: number },
): number | null {
  let node: Node | null = null
  let offset = 0
  if (typeof document.caretPositionFromPoint === "function") {
    const caret = document.caretPositionFromPoint(point.x, point.y)
    node = caret?.offsetNode ?? null
    offset = caret?.offset ?? 0
  } else if (typeof document.caretRangeFromPoint === "function") {
    const caret = document.caretRangeFromPoint(point.x, point.y)
    node = caret?.startContainer ?? null
    offset = caret?.startOffset ?? 0
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !element.contains(node)) return null
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let before = 0
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current === node) return before + offset
    before += current.textContent?.length ?? 0
  }
  return null
}

/**
 * The block whose text is under `point` in a span bound to several, so that pointing at a
 * sentence means that sentence and not every sentence sharing its line. All of the span's
 * blocks when their parts are not marked out or the point cannot be placed.
 */
export function sourceBlockIdsAtPoint(
  element: HTMLElement,
  point: { readonly x: number; readonly y: number },
): readonly string[] {
  const ids = element.getAttribute("data-page-translation-block")?.split(",").filter(Boolean) ?? []
  const extents = extentsOfSpan.get(element)
  if (ids.length < 2 || !extents || !sourceTextIsExact(element)) return ids
  const offset = textOffsetAt(element, point)
  if (offset === null) return ids
  let nearest: { readonly id: string; readonly distance: number } | null = null
  for (const id of ids) {
    const extent = extents.get(id)
    if (!extent) continue
    const distance =
      offset < extent.start ? extent.start - offset : offset > extent.end ? offset - extent.end : 0
    if (!nearest || distance < nearest.distance) nearest = { id, distance }
  }
  return nearest ? [nearest.id] : ids
}

/** Where the block's source sits on screen: one rectangle, or one per column it runs across. */
function sourceRectangles(block: SourceSpanBlock, pageRectangle: DOMRect): readonly DOMRect[] {
  const { sourceBounds, sourcePageWidth, sourcePageHeight } = block
  if (!sourceBounds || !sourcePageWidth || !sourcePageHeight) return []
  return (block.sourceParts ?? [sourceBounds]).map(
    (box) =>
      new DOMRect(
        pageRectangle.left + (box.x / sourcePageWidth) * pageRectangle.width,
        pageRectangle.top + (box.y / sourcePageHeight) * pageRectangle.height,
        (box.width / sourcePageWidth) * pageRectangle.width,
        (box.height / sourcePageHeight) * pageRectangle.height,
      ),
  )
}

function within(rectangle: DOMRect, region: DOMRect, padding: number): boolean {
  const centerX = rectangle.left + rectangle.width / 2
  const centerY = rectangle.top + rectangle.height / 2
  return (
    centerX >= region.left - padding &&
    centerX <= region.right + padding &&
    centerY >= region.top - padding &&
    centerY <= region.bottom + padding
  )
}

function appendBlockId(element: HTMLElement, blockId: string): void {
  const ids = element.getAttribute("data-page-translation-block")?.split(",") ?? []
  if (ids.includes(blockId)) return
  element.setAttribute("data-page-translation-block", [...ids, blockId].filter(Boolean).join(","))
}

type MeasuredSpan = {
  readonly element: HTMLElement
  readonly rectangle: DOMRect
  characters?: readonly CharacterOwner[]
}

function charactersOf(span: MeasuredSpan): readonly CharacterOwner[] {
  if (span.characters) return span.characters
  const text = span.element.textContent ?? ""
  const located = locatedCharacters(text)
  span.characters = located
    ? located.map(({ character, start, end }) => ({
        character,
        element: span.element,
        at: { start, end },
      }))
    : canonicalCharacters(text).map((character) => ({ character, element: span.element, at: null }))
  return span.characters
}

function bindBlock(
  block: SourceSpanBlock,
  pageRectangle: DOMRect,
  spans: readonly MeasuredSpan[],
): boolean {
  const regions = sourceRectangles(block, pageRectangle)
  if (regions.length === 0) return false
  const padding = Math.max(2, pageRectangle.width * 0.005)
  const owners = spans
    .filter((span) => regions.some((region) => within(span.rectangle, region, padding)))
    .flatMap(charactersOf)
  const needle = canonicalCharacters(block.source).join("")
  if (!needle || owners.length === 0) return false
  const start = owners
    .map(({ character }) => character)
    .join("")
    .indexOf(needle)
  if (start < 0) return false
  // The first and last of the block's characters in each span it runs through.
  const matched = new Map<HTMLElement, TextExtent | null>()
  for (const { element, at } of owners.slice(start, start + needle.length)) {
    const known = matched.get(element)
    if (known === null) continue
    matched.set(element, at && (known === undefined ? at : { start: known.start, end: at.end }))
  }
  for (const [element, extent] of matched) {
    appendBlockId(element, block.id)
    if (!extent) continue
    const extents = extentsOfSpan.get(element) ?? new Map<string, TextExtent>()
    extents.set(block.id, withPunctuation(element.textContent ?? "", extent))
    extentsOfSpan.set(element, extents)
  }
  return matched.size > 0
}

export function bindPageTranslationSpans(
  page: HTMLElement | null,
  blocks: readonly SourceSpanBlock[],
): ReadonlySet<string> {
  if (!page) return new Set()
  const pageRectangle = page.getBoundingClientRect()
  if (pageRectangle.width <= 0 || pageRectangle.height <= 0) return new Set()
  // Measured once: each block used to measure every span on the page again.
  const spans = [...page.querySelectorAll<HTMLElement>(".textLayer span")].map(
    (element): MeasuredSpan => ({ element, rectangle: element.getBoundingClientRect() }),
  )
  const matched = new Set<string>()
  for (const block of blocks) if (bindBlock(block, pageRectangle, spans)) matched.add(block.id)
  return matched
}

export function sourceElementMatchesBlock(element: HTMLElement, blockId: string): boolean {
  return element.getAttribute("data-page-translation-block")?.split(",").includes(blockId) ?? false
}
