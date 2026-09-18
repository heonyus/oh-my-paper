import type { ParsedDocumentPage, ParsedPageBlock } from "../../shared/documentPageModel"
import type { SourceFragment } from "../../shared/schemas"
import { parsedPageVisualGroups } from "./parsedPageVisualGroups"
import type { DetectedStructure, StructureKind } from "./structureDetector"

function structureKind(label: ParsedPageBlock["label"]): StructureKind | null {
  switch (label) {
    case "doc_title":
    case "paragraph_title":
      return "section"
    case "equation":
      return "equation"
    default:
      return null
  }
}

function scaledBounds(
  bounds: ParsedPageBlock["bounds"],
  page: ParsedDocumentPage,
  width: number,
  height: number,
): SourceFragment {
  return {
    x: (bounds.x * width) / page.width,
    y: (bounds.y * height) / page.height,
    width: (bounds.width * width) / page.width,
    height: (bounds.height * height) / page.height,
  }
}

export function parsedPageStructures(
  page: ParsedDocumentPage,
  renderedWidth: number,
  renderedHeight: number,
): readonly DetectedStructure[] {
  const ordered = [...page.blocks].sort((left, right) => left.order - right.order)
  const nonVisual = ordered.flatMap((block) => {
    const kind = structureKind(block.label)
    if (!kind) return []
    const content = block.content.trim()
    const fallbackTitle = kind === "equation" ? "Equation" : "Section"
    return [
      {
        id: block.id,
        kind,
        page: page.pageNumber,
        title: content || fallbackTitle,
        quote: content,
        bounds: scaledBounds(block.bounds, page, renderedWidth, renderedHeight),
      },
    ]
  })
  const visual = parsedPageVisualGroups(page).map((group) => {
    const content = group.caption?.content.trim() ?? ""
    return {
      id: group.id,
      kind: group.kind,
      page: page.pageNumber,
      title: content || (group.kind === "figure" ? "Figure" : "Table"),
      quote: content,
      bounds: scaledBounds(group.bounds, page, renderedWidth, renderedHeight),
    }
  })
  return [...nonVisual, ...visual].sort(
    (left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x,
  )
}
