import type { SourceDocumentAst } from "../../shared/documentAst"
import type { DocumentLayoutBox, DocumentLayoutPage } from "../../shared/documentLayout"
import type { PageStructureKind } from "../../shared/pageStructure"
import { deriveDocumentReadingOrder } from "./documentReadingOrder"
import type { PageSourceBlock } from "./pageTranslationSource"

export type LocalPageTranslationBlock = PageSourceBlock & {
  readonly sourceItemIds: readonly string[]
  readonly structureKind: PageStructureKind
  readonly translation?: string
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

function intersectionRatio(
  left: LocalPageTranslationBlock["bounds"],
  right: DocumentLayoutBox,
): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return (width * height) / Math.max(1, left.width * left.height)
}

function layoutKind(
  bounds: LocalPageTranslationBlock["bounds"],
  layout: DocumentLayoutPage | null,
): PageStructureKind | null {
  const box = layout?.boxes
    .map((candidate) => ({ candidate, overlap: intersectionRatio(bounds, candidate) }))
    .filter(({ overlap }) => overlap >= 0.25)
    .sort((left, right) => right.overlap - left.overlap)[0]?.candidate
  const label = box?.label
  switch (label) {
    case "doc_title":
      return "title"
    case "paragraph_title":
      return "heading"
    case "figure_title":
      return "caption"
    case "table":
      return "table"
    case "equation":
      return "equation"
    case "text":
    case "code":
    case "list":
      return "body"
    case "chart":
    case "image":
    case "header":
    case "footer":
    case "page_number":
    case "aside_text":
    case "page_footnote":
    case undefined:
      return null
    default: {
      const exhaustive: never = label
      return exhaustive
    }
  }
}

function pageBounds(
  box: DocumentLayoutBox,
  layout: DocumentLayoutPage,
  width: number,
  height: number,
): LocalPageTranslationBlock["bounds"] {
  return {
    x: (box.x * width) / layout.width,
    y: (box.y * height) / layout.height,
    width: (box.width * width) / layout.width,
    height: (box.height * height) / layout.height,
  }
}

function intersects(
  left: LocalPageTranslationBlock["bounds"],
  right: LocalPageTranslationBlock["bounds"],
): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  )
}

function mineruBlocks(
  ast: SourceDocumentAst,
  pageNumber: number,
  layout: DocumentLayoutPage,
): readonly LocalPageTranslationBlock[] {
  const sourcePage = ast.pages.find((page) => page.id === `page:${pageNumber}`)
  if (!sourcePage) return []
  const pageItems = ast.items.filter((item) => item.pageId === sourcePage.id)
  return [...layout.boxes]
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .flatMap((box) => {
      const structureKind = layoutKind(box, { ...layout, boxes: [box] })
      if (
        !structureKind ||
        structureKind === "table" ||
        box.label === "image" ||
        box.label === "chart"
      )
        return []
      const bounds = pageBounds(box, layout, sourcePage.width, sourcePage.height)
      const sourceItemIds = pageItems
        .filter((item) => intersects(item.bounds, bounds))
        .map((item) => item.id)
      if (sourceItemIds.length === 0) return []
      const source = box.content?.trim() || sourceText(ast, sourceItemIds)
      if (!source) return []
      return [
        {
          id: `block:mineru-${pageNumber}-${box.order ?? 0}`,
          kind: structureKind === "heading" || structureKind === "title" ? "heading" : "body",
          source,
          sourceItemIds,
          structureKind,
          bounds,
        },
      ]
    })
}

function sourceText(ast: SourceDocumentAst, ids: readonly string[]): string {
  return ast.items
    .filter((item) => ids.includes(item.id))
    .sort((left, right) => left.normalizedStart - right.normalizedStart)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/(?<=\p{Ll})-\s+(?=\p{Ll})/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
}

function inferredKind(text: string, y: number, pageHeight: number): PageStructureKind {
  if (/^(?:abstract|introduction|background|methods?|results|discussion|conclusion)\b/iu.test(text))
    return "heading"
  if (/^(?:figure|fig\.?|table|chart)\s*\d+/iu.test(text)) return "caption"
  if (/[=≤≥≈∑∫√±∆]/u.test(text) && text.length < 240) return "equation"
  if (y > pageHeight * 0.88) return "footnote"
  if (y < pageHeight * 0.18 && text.length < 240) return "metadata"
  return "body"
}

export function localPageTranslationBlocks(
  ast: SourceDocumentAst,
  pageNumber: number,
  layout: DocumentLayoutPage | null,
): readonly LocalPageTranslationBlock[] {
  const pageId = `page:${pageNumber}`
  const sourcePage = ast.pages.find((page) => page.id === pageId)
  if (layout?.parser === "mineru") return mineruBlocks(ast, pageNumber, layout)
  const readingPage = deriveDocumentReadingOrder(ast).pages.find((page) => page.pageId === pageId)
  if (!sourcePage || !readingPage) return []
  return readingPage.blocks.flatMap((block) => {
    const text = sourceText(ast, block.sourceItemIds)
    if (!text) return []
    const structureKind =
      layoutKind(block.bounds, layout) ?? inferredKind(text, block.bounds.y, sourcePage.height)
    if (structureKind === "table") return []
    return [
      {
        id: block.id,
        kind: structureKind === "heading" || structureKind === "title" ? "heading" : "body",
        source: text,
        sourceItemIds: block.sourceItemIds,
        structureKind,
        bounds: block.bounds,
      },
    ]
  })
}
