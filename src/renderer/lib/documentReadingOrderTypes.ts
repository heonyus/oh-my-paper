import type { SourceDocumentAst } from "../../shared/documentAst"
import type { PageBounds, SourceItemId, SourcePageId, SourceRange } from "./documentSemanticTypes"

export type Orientation = "horizontal" | "vertical"

export type ReadingLine = {
  readonly id: string
  readonly pageId: SourcePageId
  readonly sourceItemIds: readonly SourceItemId[]
  readonly sourceRange: SourceRange
  readonly bounds: PageBounds
  readonly orientation: Orientation
  readonly direction: "ltr" | "rtl"
  readonly confidence: number
  readonly reasons: readonly string[]
  readonly crossCenter: number
}

export type ReadingBlock = {
  readonly id: string
  readonly pageId: SourcePageId
  readonly lineIds: readonly string[]
  readonly sourceItemIds: readonly SourceItemId[]
  readonly sourceRange: SourceRange
  readonly bounds: PageBounds
  readonly columnId: string
  readonly confidence: number
  readonly reasons: readonly string[]
}

export type ReadingOrderRelation = {
  readonly from: string
  readonly to: string
  readonly kind: "before" | "uncertain"
  readonly confidence: number
  readonly reasons: readonly string[]
}

export type SourceCharacterMapEntry = {
  readonly pageId: SourcePageId
  readonly normalizedOffset: number
  readonly sourceItemId: SourceItemId
  readonly sourceRange: SourceRange
}

export type ReadingColumn = {
  readonly id: string
  readonly pageId: SourcePageId
  readonly lineIds: readonly string[]
  readonly blockIds: readonly string[]
  readonly bounds: PageBounds
  readonly confidence: number
  readonly reasons: readonly string[]
}

export type ReadingOrderPage = {
  readonly pageId: SourcePageId
  readonly columns: readonly ReadingColumn[]
  readonly lines: readonly ReadingLine[]
  readonly blocks: readonly ReadingBlock[]
  readonly orderedLineIds: readonly string[]
  readonly orderedBlockIds: readonly string[]
  readonly orderedSourceItemIds: readonly SourceItemId[]
  readonly relations: readonly ReadingOrderRelation[]
}

export type DocumentReadingOrder = {
  readonly sourceHash: string
  readonly pages: readonly ReadingOrderPage[]
  readonly characterMap: readonly SourceCharacterMapEntry[]
}

export type ColumnWork = {
  readonly id: string
  readonly lines: readonly ReadingLine[]
  readonly blocks: readonly ReadingBlock[]
}

export type ReadingOrderSource = SourceDocumentAst
