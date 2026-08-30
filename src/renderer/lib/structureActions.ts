import type { BoardCard, DocumentId, Viewport } from "../../shared/schemas"
import type { AiRequestRunner } from "../types"
import { CARD_WIDTH, createStructureCard } from "./board"
import { parsedCardResponse } from "./cardPresentation"
import { citationCardSource } from "./citationCardSource"
import { assessCitationStructure } from "./citationStructureAssessment"
import { cropFeatureImage } from "./pdfFeatureDom"
import { featureRequestContext, sectionRequestContext } from "./sectionContext"
import { rectsToElementSpace } from "./selectionGeometry"
import { structureAiRequest } from "./structureAiRequest"
import {
  shouldRegenerateStructureCard,
  structureSourceKey,
  upsertStructureCard,
} from "./structureCardState"
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
  readonly onCardStream: (id: BoardCard["id"], delta: string) => void
  readonly onCardStreamEnd: (id: BoardCard["id"]) => void
  readonly onAiRequest: AiRequestRunner
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
    const viewer = input.viewportElement
    const pageElement = viewer?.querySelector<HTMLElement>(
      `.page[data-page-number="${structure.page}"]`,
    )
    if (!viewer || !pageElement || !input.worldElement) return
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

    const retryCitation =
      upserted.reused && shouldRegenerateStructureCard(card, activeGenerations.has(card.id))
    if (upserted.reused && !retryCitation) return
    if (retryCitation) {
      input.commitCards(
        patchCard(input.getCards(), card.id, (item) => ({
          ...item,
          loading: true,
          body: "인용 논문과 읽을 가치를 다시 확인하는 중입니다.",
        })),
      )
    }

    const currentGen = (activeGenerations.get(card.id) ?? 0) + 1
    activeGenerations.set(card.id, currentGen)

    void (async () => {
      if (structure.kind === "citation") {
        const result = await assessCitationStructure({
          structure,
          currentPaperTitle: input.currentPaperTitle,
          onAiRequest: input.onAiRequest,
          onMetadata: (paper) => {
            if (activeGenerations.get(card.id) !== currentGen) return
            input.commitCards(
              patchCard(input.getCards(), card.id, (item) => ({
                ...item,
                ...citationCardSource(paper),
              })),
            )
          },
        })
        if (activeGenerations.get(card.id) !== currentGen) return
        if (result.status !== "not_found") {
          const paper = result.paper
          const source = citationCardSource(paper)
          input.commitCards(
            patchCard(input.getCards(), card.id, (item) => ({
              ...item,
              loading: false,
              body:
                result.status === "assessed"
                  ? result.body
                  : "읽기 가치 판독을 완료하지 못했습니다. 인용 버튼을 다시 누르면 재시도합니다.",
              sourceUrl: source.sourceUrl,
              sourceMeta: {
                ...source.sourceMeta,
                ...(result.status === "assessed" ? { assessment: result.assessment } : {}),
              },
            })),
          )
        } else {
          input.commitCards(
            patchCard(input.getCards(), card.id, (item) => ({
              ...item,
              loading: false,
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
      const requestContext =
        structure.kind === "section"
          ? sectionRequestContext({
              viewer,
              page: pageElement,
              heading: structure.quote,
              bounds: structure.bounds,
              paperTitle: input.currentPaperTitle,
            })
          : { paper: "", section: featureRequestContext(pageElement, structure.bounds) }
      const explanation = await input.onAiRequest(
        structureAiRequest(structure, imageDataUrl, requestContext),
        (delta) => input.onCardStream(card.id, delta),
      )
      if (activeGenerations.get(card.id) !== currentGen) return
      input.commitCards(
        patchCard(input.getCards(), card.id, (item) => ({
          ...item,
          ...parsedCardResponse(explanation, item.title),
          loading: false,
        })),
      )
      input.onCardStreamEnd(card.id)
    })().catch(() => {
      if (activeGenerations.get(card.id) !== currentGen) return
      input.onCardStreamEnd(card.id)
      input.commitCards(
        patchCard(input.getCards(), card.id, (item) => ({
          ...item,
          loading: false,
          body:
            structure.kind === "citation" && item.sourceMeta
              ? "읽기 가치 판독을 완료하지 못했습니다. 인용 버튼을 다시 누르면 재시도합니다."
              : "AI 요청을 완료하지 못했습니다. 설정을 확인하고 다시 시도해주세요.",
        })),
      )
    })
  }
}
