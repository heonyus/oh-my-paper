import {
  type BoardCard,
  cardIdSchema,
  type DocumentId,
  type Point,
  type SourceAnchor,
  type SourceFragment,
} from "../../shared/schemas"
import type { BoardTextSelection } from "./boardSelection"
import type { DetectedStructure } from "./structureDetector"

export const CARD_WIDTH = 320

export const CARD_COPY = {
  translation: {
    title: "페이지 번역",
    body: "선택한 구절의 번역을 생성하려면 API 설정이 필요합니다.",
  },
  explanation: {
    title: "선택 구절 설명",
    body: "선택한 근거를 중심으로 설명 카드를 준비했습니다.",
  },
  infographic: { title: "인포그래픽", body: "선택한 구절을 시각화할 준비가 되었습니다." },
  note: { title: "주석", body: "이 구절에 연결된 메모입니다." },
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
    ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
    anchor: input.anchor,
  }
}

export function saveTranslationAsNote(card: BoardCard): BoardCard {
  return card.kind === "translation" ? { ...card, kind: "note", title: "번역 주석" } : card
}

export function createSelectionCard(
  documentId: DocumentId,
  selection: BoardTextSelection,
  kind: keyof typeof CARD_COPY,
): BoardCard | null {
  const copy = CARD_COPY[kind]
  const first = selection.fragments[0]
  if (!first) return null
  return createBoardCard({
    documentId,
    kind,
    title: copy.title,
    body: kind === "highlight" ? selection.quote : copy.body,
    placement: selection.cardPosition,
    anchor: {
      page: selection.page,
      quote: selection.quote,
      x: first.x + first.width,
      y: first.y + first.height / 2,
      fragments: [...selection.fragments],
    },
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
  const body =
    structure.kind === "citation"
      ? "인용 논문 메타정보를 확인하는 중입니다."
      : `${structure.title}을(를) AI가 분석하는 중입니다.`
  return createBoardCard({
    documentId,
    kind: cardKind,
    title: structure.title,
    body,
    sourceKey,
    placement: {
      x: fragment.x + fragment.width + 32,
      y: Math.max(pageWorld.y, fragment.y - 18),
    },
    anchor: {
      page: structure.page,
      quote: structure.quote,
      x: fragment.x + fragment.width,
      y: fragment.y + fragment.height / 2,
      fragments: [fragment],
    },
  })
}
