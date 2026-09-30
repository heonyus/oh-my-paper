import {
  type BoardCard,
  cardIdSchema,
  type DocumentId,
  type Point,
  type SourceAnchor,
  type SourceFragment,
} from "../../shared/schemas"
import type { BoardTextSelection } from "./boardSelection"
import { translationCardTitle } from "./cardPresentation"
import { addAstRangesToAnchor } from "./documentAstMigration"
import { activeDocumentAst } from "./documentAstRuntime"
import type { DetectedStructure } from "./structureDetector"

export const CARD_WIDTH = 300
export const CARD_PAGE_GAP = 32
export const DEFAULT_RESEARCH_CARD_HEIGHT = 420
export const SHORT_TRANSLATION_CARD_HEIGHT = 180
export const MINIMIZED_CARD_HEIGHT = 32

export function initialResearchCardHeight(card: BoardCard): number {
  return card.kind === "translation" && card.anchor.quote.trim().length <= 120
    ? SHORT_TRANSLATION_CARD_HEIGHT
    : DEFAULT_RESEARCH_CARD_HEIGHT
}

/**
 * AI cards open in the gutter left of the page: the right side already holds the research
 * sidebar and page translations.
 */
export function cardPlacementBesidePage(page: SourceFragment, source: SourceFragment): Point {
  return {
    x: page.x - CARD_PAGE_GAP - CARD_WIDTH,
    y: Math.max(page.y, source.y - 18),
  }
}

/** Curve from the quoted source to whichever card edge faces it. */
export function connectorPath(card: BoardCard): string {
  const source = card.anchor.fragments[0]
  const sourceLeft = source ? source.x : card.anchor.x
  const sourceRight = source ? source.x + source.width : card.anchor.x
  const cardWidth = card.width ?? CARD_WIDTH
  const startY = card.anchor.y
  const endY = card.y + 28
  if (card.x + cardWidth / 2 < (sourceLeft + sourceRight) / 2) {
    const endX = card.x + cardWidth
    return `M ${sourceLeft} ${startY} C ${sourceLeft - 90} ${startY}, ${endX + 90} ${endY}, ${endX} ${endY}`
  }
  return `M ${sourceRight} ${startY} C ${sourceRight + 90} ${startY}, ${card.x - 90} ${endY}, ${card.x} ${endY}`
}

export const CARD_COPY = {
  translation: {
    title: "선택 번역",
    body: "",
  },
  explanation: {
    title: "선택 구절 설명",
    body: "",
  },
  infographic: { title: "인포그래픽", body: "" },
  note: { title: "메모", body: "" },
  highlight: { title: "하이라이트", body: "" },
} as const

type CreateCardInput = {
  readonly documentId: DocumentId
  readonly kind: BoardCard["kind"]
  readonly title: string
  readonly body: string
  readonly anchor: SourceAnchor
  readonly placement: Point
  readonly sourceKey?: string
  readonly loading?: boolean
}

export function createBoardCard(input: CreateCardInput): BoardCard {
  return {
    id: cardIdSchema.parse(crypto.randomUUID()),
    documentId: input.documentId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    x: input.placement.x,
    y: input.placement.y,
    minimized: false,
    width: CARD_WIDTH,
    height: null,
    loading: input.loading ?? false,
    chat: [],
    ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
    anchor: input.anchor,
  }
}

export function saveTranslationAsAnnotation(card: BoardCard): BoardCard {
  return card.kind === "translation" ? { ...card, kind: "highlight", title: "AI 번역" } : card
}

export function createPostIt(documentId: DocumentId, page: number, placement: Point): BoardCard {
  return createBoardCard({
    documentId,
    kind: "sticky",
    title: "포스트잇",
    body: "",
    placement,
    anchor: {
      page,
      quote: "보드 포스트잇",
      x: placement.x,
      y: placement.y,
      fragments: [{ x: placement.x, y: placement.y, width: 1, height: 1 }],
    },
  })
}

export function createSelectionCard(
  documentId: DocumentId,
  selection: BoardTextSelection,
  kind: keyof typeof CARD_COPY,
): BoardCard | null {
  const copy = CARD_COPY[kind]
  const first = selection.fragments[0]
  if (!first) return null
  const anchor = {
    page: selection.page,
    quote: selection.quote,
    x: first.x + first.width,
    y: first.y + first.height / 2,
    fragments: [...selection.fragments],
  }
  const ast = activeDocumentAst(documentId)
  return createBoardCard({
    documentId,
    kind,
    title: kind === "translation" ? translationCardTitle(selection.quote) : copy.title,
    body: kind === "highlight" ? selection.quote : copy.body,
    placement: selection.cardPosition,
    anchor: ast ? addAstRangesToAnchor(ast, anchor) : anchor,
    loading: kind !== "note" && kind !== "highlight",
  })
}

type StructureCardInput = {
  readonly documentId: DocumentId
  readonly structure: DetectedStructure
  readonly pageWorld: SourceFragment
  readonly fragment: SourceFragment
  readonly sourceKey: string
}

export function createStructureCard(input: StructureCardInput): BoardCard {
  const { documentId, structure, pageWorld, fragment, sourceKey } = input
  const cardKind =
    structure.kind === "citation"
      ? "citation"
      : structure.kind === "figure"
        ? "infographic"
        : "explanation"
  const anchor = {
    page: structure.page,
    quote: structure.quote,
    x: fragment.x + fragment.width,
    y: fragment.y + fragment.height / 2,
    fragments: [fragment],
  }
  const ast = activeDocumentAst(documentId)
  return createBoardCard({
    documentId,
    kind: cardKind,
    title: structure.title,
    body: "",
    sourceKey,
    loading: true,
    placement: cardPlacementBesidePage(pageWorld, fragment),
    anchor: ast ? addAstRangesToAnchor(ast, anchor) : anchor,
  })
}
