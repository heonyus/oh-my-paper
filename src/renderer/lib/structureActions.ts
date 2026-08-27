import type { AiAction, AiRequest } from "../../shared/ipc"
import type { BoardCard, DocumentId, Viewport } from "../../shared/schemas"
import { CARD_WIDTH, createStructureCard } from "./board"
import { assessCitationStructure } from "./citationStructureAssessment"
import { cropFeatureImage } from "./pdfFeatureDom"
import { rectsToElementSpace } from "./selectionGeometry"
import { structureSourceKey, upsertStructureCard } from "./structureCardState"
import type { DetectedStructure } from "./structureDetector"
import { revealWorldRectHorizontally } from "./viewport"

type StructureActionsInput = {
  readonly documentId: DocumentId
  readonly currentPaperTitle: string
  readonly viewport: Viewport
  readonly viewportElement: HTMLDivElement | null
  readonly worldElement: HTMLDivElement | null
  readonly getCards: () => readonly BoardCard[]
  readonly commitCards: (cards: readonly BoardCard[]) => void
  readonly onViewportChange: (viewport: Viewport) => void
  readonly onCardActivated: (id: BoardCard["id"]) => void
  readonly onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>
}

function actionFor(structure: DetectedStructure): AiAction {
  switch (structure.kind) {
    case "citation":
    case "figure":
    case "table":
    case "equation":
      return structure.kind
    case "section":
      return "section"
  }
}

function patchCard(
  cards: readonly BoardCard[],
  id: BoardCard["id"],
  update: (card: BoardCard) => BoardCard,
): readonly BoardCard[] {
  return cards.map((card) => (card.id === id ? update(card) : card))
}

const activeGenerations = new Map<string, number>()

export function createStructureActionHandler(
  input: StructureActionsInput,
): (structure: DetectedStructure) => void {
  return (structure) => {
    const pageElement = input.viewportElement?.querySelector<HTMLElement>(
      `.page[data-page-number="${structure.page}"]`,
    )
    if (!pageElement || !input.worldElement) return
    const worldRect = input.worldElement.getBoundingClientRect()
    const pageRect = pageElement.getBoundingClientRect()
    const worldBounds = {
      left: worldRect.left,
      top: worldRect.top,
      width: worldRect.width,
      height: worldRect.height,
    }
    const worldSize = {
      width: input.worldElement.offsetWidth,
      height: input.worldElement.offsetHeight,
    }
    const pageWorld = rectsToElementSpace(
      [{ left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height }],
      worldBounds,
      worldSize,
    )[0]
    const fragment = rectsToElementSpace(
      [
        {
          left: pageRect.left + structure.bounds.x,
          top: pageRect.top + structure.bounds.y,
          width: structure.bounds.width,
          height: structure.bounds.height,
        },
      ],
      worldBounds,
      worldSize,
    )[0]
    if (!pageWorld || !fragment) return
    const sourceKey = structureSourceKey(structure)
    const freshCard = createStructureCard({
      documentId: input.documentId,
      structure,
      pageWorld,
      fragment,
      sourceKey,
    })
    const upserted = upsertStructureCard(input.getCards(), freshCard, structure)
    const card = upserted.card
    input.commitCards(upserted.cards)
    input.onCardActivated(card.id)
    const availableWidth = input.viewportElement?.clientWidth
    if (availableWidth)
      input.onViewportChange(
        revealWorldRectHorizontally(
          input.viewport,
          availableWidth,
          { x: card.x, width: CARD_WIDTH },
          16,
        ),
      )

    const currentGen = (activeGenerations.get(card.id) ?? 0) + 1
    activeGenerations.set(card.id, currentGen)

    void (async () => {
      if (structure.kind === "citation") {
        const result = await assessCitationStructure(
          structure,
          input.currentPaperTitle,
          input.onAiRequest,
        )
        if (activeGenerations.get(card.id) !== currentGen) return
        if (result.status !== "not_found") {
          const paper = result.paper
          input.commitCards(
            patchCard(input.getCards(), card.id, (item) => ({
              ...item,
              body:
                result.status === "assessed"
                  ? result.body
                  : "메타정보를 확인했습니다. AI 설정 후 읽을 가치 판독을 다시 실행하세요.",
              sourceUrl: paper.openAccessUrl ?? paper.url,
              sourceMeta: {
                title: paper.title,
                authors: paper.authors,
                year: paper.year,
                venue: paper.venue,
                abstract: paper.abstract,
                doi: paper.doi,
                url: paper.url,
                citationCount: paper.citationCount,
                ...(result.status === "assessed" ? { assessment: result.assessment } : {}),
              },
            })),
          )
        } else {
          input.commitCards(
            patchCard(input.getCards(), card.id, (item) => ({
              ...item,
              body: "인용 논문의 온라인 메타정보를 찾지 못했습니다. 인용 문맥은 보존했습니다.",
            })),
          )
        }
        return
      }
      const imageDataUrl =
        structure.kind === "figure" || structure.kind === "table" || structure.kind === "equation"
          ? cropFeatureImage(pageElement, {
              kind: structure.kind,
              pageNumber: structure.page,
              rect: structure.bounds,
              label: structure.title,
              context: structure.quote,
              priority: 1,
              sourceSpanIds: [],
            })
          : null
      const baseRequest = {
        action: actionFor(structure),
        page: structure.page,
        quote: structure.quote,
        before: "",
        after: "",
        featureKind: structure.kind === "section" ? "heading" : structure.kind,
      } satisfies Omit<AiRequest, "documentId" | "imageDataUrl">
      const explanation = await input.onAiRequest(
        imageDataUrl ? { ...baseRequest, imageDataUrl } : baseRequest,
      )
      if (activeGenerations.get(card.id) !== currentGen) return
      input.commitCards(
        patchCard(input.getCards(), card.id, (item) => ({ ...item, body: explanation })),
      )
    })().catch(() => {
      if (activeGenerations.get(card.id) !== currentGen) return
      input.commitCards(
        patchCard(input.getCards(), card.id, (item) => ({
          ...item,
          body:
            structure.kind === "citation" && item.sourceMeta
              ? "메타정보를 불러왔습니다. AI 키를 설정하면 인용 관계 설명을 생성합니다."
              : "OpenAI API 키를 설정한 뒤 다시 실행하세요.",
        })),
      )
    })
  }
}
