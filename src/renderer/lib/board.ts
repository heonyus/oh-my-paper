import { type Locale, translator } from "../../shared/i18n/locale"
import {
  type BoardCard,
  cardIdSchema,
  type DocumentId,
  type Point,
  type SourceAnchor,
  type SourceFragment,
} from "../../shared/schemas"
import { type BoardMessageKey, boardMessages } from "../messages/board"
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

/**
 * Highlights and translations are drawn on the passage itself rather than as a card beside the
 * page; a translation shows its text when the reader hovers the passage.
 */
export function drawnOnPassage(card: BoardCard): boolean {
  return card.kind === "highlight" || card.kind === "translation"
}

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

/** Room kept between a new card and the cards already on the board. */
export const CARD_GAP = 16

type CardBox = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function cardBox(card: BoardCard): CardBox {
  return {
    x: card.x,
    y: card.y,
    width: card.width ?? CARD_WIDTH,
    height: card.minimized
      ? MINIMIZED_CARD_HEIGHT
      : (card.height ?? initialResearchCardHeight(card)),
  }
}

/** Cards beside a page differ by a fraction of a pixel in x, which should not count as touching. */
const PLACEMENT_SLACK = 2

function touches(a: CardBox, b: CardBox): boolean {
  return (
    a.x + PLACEMENT_SLACK < b.x + b.width + CARD_GAP &&
    b.x + PLACEMENT_SLACK < a.x + a.width + CARD_GAP &&
    a.y < b.y + b.height + CARD_GAP &&
    b.y < a.y + a.height + CARD_GAP
  )
}

/**
 * A new card moved so it touches no card already on its paper's board: down its column from where
 * it would open, or, when that column would push it more than a card's height away from its
 * passage, into the next column out (away from the page) if that is nearer. Cards drawn on the
 * passage take no room beside the page.
 */
export function clearOfCards(card: BoardCard, cards: readonly BoardCard[]): BoardCard {
  if (drawnOnPassage(card)) return card
  const others = cards
    .filter(
      (other) =>
        other.id !== card.id && other.documentId === card.documentId && !drawnOnPassage(other),
    )
    .map(cardBox)
  const box = cardBox(card)
  const freeY = (x: number): number => {
    let y = box.y
    for (;;) {
      const hits = others.filter((other) => touches({ ...box, x, y }, other))
      if (hits.length === 0) return y
      y = Math.max(...hits.map((other) => other.y + other.height)) + CARD_GAP
    }
  }
  const besidePage = freeY(box.x)
  if (besidePage === box.y) return card
  if (besidePage - box.y <= box.height) return { ...card, y: besidePage }
  const outerX = box.x - box.width - CARD_GAP
  const outer = freeY(outerX)
  return outer < besidePage ? { ...card, x: outerX, y: outer } : { ...card, y: besidePage }
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

/**
 * The title a card made from a selection starts with, in the reader's language when it is made;
 * a translation card is named after the selection itself. Nothing compares these titles later.
 */
const SELECTION_CARD_TITLE = {
  translation: null,
  explanation: "default.explanationTitle",
  infographic: "default.infographicTitle",
  note: "default.noteTitle",
  highlight: "default.highlightTitle",
} as const satisfies Readonly<Record<string, BoardMessageKey | null>>

export type SelectionCardKind = keyof typeof SELECTION_CARD_TITLE

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

/**
 * A note card added on a paper, left on the board where it was written so the reader keeps
 * seeing it there; its text is also in the paper's note.
 */
export function createPinnedNoteCard(
  documentId: DocumentId,
  page: number,
  placement: Point,
  body: string,
  locale: Locale = "ko",
): BoardCard {
  return createBoardCard({
    documentId,
    kind: "sticky",
    title: translator(boardMessages, locale)("default.noteTitle"),
    body,
    placement,
    anchor: {
      page,
      // Placed on the board, not on a passage; the index shows no source for it.
      quote: "노트 카드",
      x: placement.x,
      y: placement.y,
      fragments: [{ x: placement.x, y: placement.y, width: 1, height: 1 }],
    },
  })
}

export function createSelectionCard(
  documentId: DocumentId,
  selection: BoardTextSelection,
  kind: SelectionCardKind,
  locale: Locale = "ko",
): BoardCard | null {
  const titleKey = SELECTION_CARD_TITLE[kind]
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
    title:
      titleKey === null
        ? translationCardTitle(selection.quote)
        : translator(boardMessages, locale)(titleKey),
    body: kind === "highlight" ? selection.quote : "",
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
