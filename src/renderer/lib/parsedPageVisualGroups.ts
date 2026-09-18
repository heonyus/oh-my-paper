import type { ParsedDocumentPage, ParsedPageBlock } from "../../shared/documentPageModel"

type VisualKind = "figure" | "table"

export type ParsedVisualGroup = {
  readonly id: string
  readonly kind: VisualKind
  readonly order: number
  readonly bounds: ParsedPageBlock["bounds"]
  readonly caption: ParsedPageBlock | null
}

type MutableGroup = {
  readonly blocks: ParsedPageBlock[]
  readonly kind: VisualKind
  caption: ParsedPageBlock | null
  bounds: ParsedPageBlock["bounds"]
}

function visualKind(block: ParsedPageBlock): VisualKind | null {
  if (block.label === "table") return "table"
  if (block.label === "image" || block.label === "chart") return "figure"
  return null
}

function unionBounds(
  left: ParsedPageBlock["bounds"],
  right: ParsedPageBlock["bounds"],
): ParsedPageBlock["bounds"] {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const farRight = Math.max(left.x + left.width, right.x + right.width)
  const bottom = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: farRight - x, height: bottom - y }
}

function intersectionArea(
  left: ParsedPageBlock["bounds"],
  right: ParsedPageBlock["bounds"],
): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return width * height
}

function withoutNestedVisuals(blocks: readonly ParsedPageBlock[]): readonly ParsedPageBlock[] {
  return blocks.filter((candidate) =>
    blocks.every((other) => {
      if (candidate.id === other.id || visualKind(candidate) !== visualKind(other)) return true
      const candidateArea = candidate.bounds.width * candidate.bounds.height
      const otherArea = other.bounds.width * other.bounds.height
      return (
        candidateArea >= otherArea ||
        intersectionArea(candidate.bounds, other.bounds) < candidateArea * 0.82
      )
    }),
  )
}

function captionKind(block: ParsedPageBlock): VisualKind | null {
  if (block.label === "table_title") return "table"
  if (block.label === "figure_title") return "figure"
  return null
}

function numberedCaption(block: ParsedPageBlock): boolean {
  const normalized = block.content
    .trim()
    .toLocaleLowerCase()
    .replace(/^fig\./u, "figure")
  const words = normalized.split(/\s+/u)
  const prefix = words[0]
  const number = words[1]?.replace(/[^0-9].*$/u, "") ?? ""
  return (prefix === "figure" || prefix === "table") && number.length > 0
}

function axisGap(startA: number, sizeA: number, startB: number, sizeB: number): number {
  return Math.max(0, Math.max(startA, startB) - Math.min(startA + sizeA, startB + sizeB))
}

function boundsScore(
  bounds: ParsedPageBlock["bounds"],
  order: number,
  caption: ParsedPageBlock,
): number {
  const xGap = axisGap(bounds.x, bounds.width, caption.bounds.x, caption.bounds.width)
  const yGap = axisGap(bounds.y, bounds.height, caption.bounds.y, caption.bounds.height)
  return yGap * 4 + xGap + Math.abs(order - caption.order)
}

function captionScore(visual: ParsedPageBlock, caption: ParsedPageBlock): number {
  return boundsScore(visual.bounds, visual.order, caption)
}

function assignNumberedCaptions(
  visuals: readonly ParsedPageBlock[],
  captions: readonly ParsedPageBlock[],
): ReadonlyMap<string, ParsedPageBlock> {
  const assignments = new Map<string, ParsedPageBlock>()
  const used = new Set<string>()
  const pairs = visuals.flatMap((visual) =>
    captions
      .filter((caption) => captionKind(caption) === visualKind(visual) && numberedCaption(caption))
      .map((caption) => ({ visual, caption, score: captionScore(visual, caption) })),
  )
  for (const pair of pairs.sort((left, right) => left.score - right.score)) {
    if (assignments.has(pair.visual.id) || used.has(pair.caption.id)) continue
    assignments.set(pair.visual.id, pair.caption)
    used.add(pair.caption.id)
  }
  return assignments
}

function groupsAreAdjacent(
  left: MutableGroup,
  right: MutableGroup,
  page: ParsedDocumentPage,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.caption && right.caption && left.caption.id !== right.caption.id) return false
  const xGap = axisGap(left.bounds.x, left.bounds.width, right.bounds.x, right.bounds.width)
  const yGap = axisGap(left.bounds.y, left.bounds.height, right.bounds.y, right.bounds.height)
  return xGap <= page.width * 0.065 && yGap <= page.height * 0.075
}

function mergeVisualGroups(groups: MutableGroup[], page: ParsedDocumentPage): MutableGroup[] {
  let changed = true
  while (changed) {
    changed = false
    for (let leftIndex = 0; leftIndex < groups.length && !changed; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < groups.length; rightIndex += 1) {
        const left = groups[leftIndex]
        const right = groups[rightIndex]
        if (!left || !right || !groupsAreAdjacent(left, right, page)) continue
        groups[leftIndex] = {
          kind: left.kind,
          blocks: [...left.blocks, ...right.blocks],
          caption: left.caption ?? right.caption,
          bounds: unionBounds(left.bounds, right.bounds),
        }
        groups.splice(rightIndex, 1)
        changed = true
        break
      }
    }
  }
  return groups
}

function includePanelTitles(
  groups: MutableGroup[],
  titles: readonly ParsedPageBlock[],
  page: ParsedDocumentPage,
): void {
  for (const title of titles.filter((candidate) => !numberedCaption(candidate))) {
    const compatible = groups
      .filter((group) => group.kind === captionKind(title))
      .map((group) => ({
        group,
        gap: boundsScore(
          group.bounds,
          Math.min(...group.blocks.map((block) => block.order)),
          title,
        ),
      }))
      .sort((left, right) => left.gap - right.gap)[0]
    if (!compatible) continue
    const xGap = axisGap(
      compatible.group.bounds.x,
      compatible.group.bounds.width,
      title.bounds.x,
      title.bounds.width,
    )
    const yGap = axisGap(
      compatible.group.bounds.y,
      compatible.group.bounds.height,
      title.bounds.y,
      title.bounds.height,
    )
    if (xGap > page.width * 0.05 || yGap > page.height * 0.055) continue
    compatible.group.bounds = unionBounds(compatible.group.bounds, title.bounds)
  }
}

export function parsedPageVisualGroups(page: ParsedDocumentPage): readonly ParsedVisualGroup[] {
  const ordered = [...page.blocks].sort((left, right) => left.order - right.order)
  const visuals = withoutNestedVisuals(ordered.filter((block) => visualKind(block) !== null))
  const titles = ordered.filter((block) => captionKind(block) !== null)
  const captions = assignNumberedCaptions(visuals, titles)
  const groups = mergeVisualGroups(
    visuals.map((block) => ({
      kind: visualKind(block) ?? "figure",
      blocks: [block],
      caption: captions.get(block.id) ?? null,
      bounds: block.bounds,
    })),
    page,
  )
  includePanelTitles(groups, titles, page)
  return groups.flatMap((group) => {
    const first = [...group.blocks].sort((left, right) => left.order - right.order)[0]
    return first
      ? [
          {
            id: first.id,
            kind: group.kind,
            order: first.order,
            bounds: group.bounds,
            caption: group.caption,
          },
        ]
      : []
  })
}
