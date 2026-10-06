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
}

const comparableCharacter = /[\p{L}\p{N}]/u

function canonicalCharacters(value: string): readonly string[] {
  return [...value.normalize("NFKC").toLocaleLowerCase()].filter((character) =>
    comparableCharacter.test(character),
  )
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

function bindBlock(
  block: SourceSpanBlock,
  pageRectangle: DOMRect,
  spans: readonly HTMLElement[],
): boolean {
  const regions = sourceRectangles(block, pageRectangle)
  if (regions.length === 0) return false
  const padding = Math.max(2, pageRectangle.width * 0.005)
  const candidates = spans.filter((span) => {
    const rectangle = span.getBoundingClientRect()
    return regions.some((region) => within(rectangle, region, padding))
  })
  const owners: CharacterOwner[] = []
  for (const element of candidates) {
    for (const character of canonicalCharacters(element.textContent ?? ""))
      owners.push({ character, element })
  }
  const needle = canonicalCharacters(block.source).join("")
  if (!needle || owners.length === 0) return false
  const start = owners
    .map(({ character }) => character)
    .join("")
    .indexOf(needle)
  if (start < 0) return false
  const matched = new Set(owners.slice(start, start + needle.length).map(({ element }) => element))
  for (const element of matched) appendBlockId(element, block.id)
  return matched.size > 0
}

export function bindPageTranslationSpans(
  page: HTMLElement | null,
  blocks: readonly SourceSpanBlock[],
): ReadonlySet<string> {
  if (!page) return new Set()
  const pageRectangle = page.getBoundingClientRect()
  if (pageRectangle.width <= 0 || pageRectangle.height <= 0) return new Set()
  const spans = [...page.querySelectorAll<HTMLElement>(".textLayer span")]
  const matched = new Set<string>()
  for (const block of blocks) if (bindBlock(block, pageRectangle, spans)) matched.add(block.id)
  return matched
}

export function sourceElementMatchesBlock(element: HTMLElement, blockId: string): boolean {
  return element.getAttribute("data-page-translation-block")?.split(",").includes(blockId) ?? false
}
