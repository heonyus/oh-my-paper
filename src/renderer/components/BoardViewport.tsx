import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CARD_WIDTH, createSelectionCard } from "../lib/board"
import { askBoardCard, regenerateBoardCardTitle } from "../lib/boardCardAi"
import { boardHighlightState } from "../lib/boardHighlights"
import { type BoardTextSelection, captureNativeBoardTextSelection } from "../lib/boardSelection"
import { parsedCardResponse } from "../lib/cardPresentation"
import { postItFromPointer } from "../lib/postItPlacement"
import { useSelectionShortcuts } from "../lib/selectionActions"
import { selectionAiRequest } from "../lib/selectionAiRequest"
import { addSelectionContext } from "../lib/selectionContext"
import { worldRectToScreen } from "../lib/selectionGeometry"
import { createStructureActionHandler } from "../lib/structureActions"
import { useBoardGestures } from "../lib/useBoardGestures"
import { useCardStreams } from "../lib/useCardStreams"
import { revealWorldRectHorizontally } from "../lib/viewport"
import type { BoardCard, CardId } from "../types"
import { BoardCardsLayer } from "./BoardCardsLayer"
import { BoardNavigationController } from "./BoardNavigationController"
import * as BoardOverlays from "./BoardOverlays"
import type { BoardViewportProps } from "./BoardViewportProps"
import { PdfSurface } from "./PdfSurface"

export function BoardViewport(props: BoardViewportProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const viewportStateRef = useRef(props.viewport)
  const cardsRef = useRef(props.cards)
  const [selectionMenu, setSelectionMenu] = useState<BoardTextSelection | null>(null)
  const [activeCardId, setActiveCardId] = useState<CardId | null>(null)
  const [createdStickyId, setCreatedStickyId] = useState<CardId | null>(null)
  const cardStreams = useCardStreams(props.cards)

  const { startPan, movePan, endPan, handleWheel } = useBoardGestures({
    viewport: props.viewport,
    onViewportChange: props.onViewportChange,
    onClearSelection: () => {
      setSelectionMenu(null)
      setActiveCardId(null)
    },
    tool: props.tool,
  })

  useEffect(() => {
    viewportStateRef.current = props.viewport
    cardsRef.current = props.cards
  }, [props.viewport, props.cards])

  const readNativeSelection = useCallback((): void => {
    if (props.tool === "pan") {
      setSelectionMenu(null)
      return
    }
    const nativeSelection = window.getSelection()
    const range = nativeSelection?.rangeCount ? nativeSelection.getRangeAt(0) : null
    const anchorNode = nativeSelection?.anchorNode
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
    const pageElement = anchorElement?.closest<HTMLElement>(".page")
    const boardWorldElement = worldRef.current
    if (
      !nativeSelection ||
      nativeSelection.isCollapsed ||
      !range ||
      !pageElement ||
      !boardWorldElement
    ) {
      setSelectionMenu(null)
      return
    }
    const selection = captureNativeBoardTextSelection({
      pageElement,
      boardWorldElement,
      range,
      quote: nativeSelection.toString(),
    })
    if (!selection) {
      setSelectionMenu(null)
      return
    }
    setSelectionMenu(addSelectionContext(selection, pageElement))
  }, [props.tool])

  useEffect(() => {
    document.addEventListener("selectionchange", readNativeSelection)
    return () => document.removeEventListener("selectionchange", readNativeSelection)
  }, [readNativeSelection])

  const handlePageJump = useCallback(
    (_page: number, pageElement: HTMLElement): void => {
      const viewportElement = viewportRef.current
      if (!viewportElement) return
      const viewportRect = viewportElement.getBoundingClientRect()
      const pageRect = pageElement.getBoundingClientRect()
      const targetTop = viewportRect.top + Math.min(80, viewportRect.height * 0.12)
      const currentViewport = viewportStateRef.current
      props.onViewportChange({
        ...currentViewport,
        y: currentViewport.y + targetTop - pageRect.top,
      })
    },
    [props.onViewportChange],
  )
  const { activeCards, fragments: highlightedFragments } = boardHighlightState(
    props.cards,
    activeCardId,
  )

  function commitCards(cards: readonly BoardCard[]): void {
    cardsRef.current = cards
    props.onCardsChange(cards)
  }

  function updateCardBody(id: CardId, body: string): void {
    commitCards(
      cardsRef.current.map((card) => {
        if (card.id !== id) return card
        const parsed = parsedCardResponse(body, card.title)
        return { ...card, ...parsed, loading: false }
      }),
    )
  }

  function placePostIt(event: Parameters<typeof postItFromPointer>[0]): boolean {
    const card = postItFromPointer(event, {
      documentId: props.document.id,
      page: props.currentPage,
      viewport: props.viewport,
      viewportElement: viewportRef.current,
      enabled: props.tool === "sticky",
    })
    if (!card) return false
    event.preventDefault()
    commitCards([...cardsRef.current, card])
    setActiveCardId(card.id)
    setCreatedStickyId(card.id)
    props.onToolChange("select")
    return true
  }

  function addCard(kind: BoardOverlays.SelectionAction): void {
    if (!selectionMenu) return
    const card = createSelectionCard(props.document.id, selectionMenu, kind)
    if (!card) return
    const boardWidth = viewportRef.current?.clientWidth
    if (boardWidth) {
      props.onViewportChange(
        revealWorldRectHorizontally(
          props.viewport,
          boardWidth,
          { x: card.x, width: CARD_WIDTH },
          16,
        ),
      )
    }
    commitCards([...cardsRef.current, card])
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    const request = selectionAiRequest(kind, selectionMenu)
    if (request) {
      void props
        .onAiRequest(request, (delta) => cardStreams.append(card.id, delta))
        .then((body) => {
          updateCardBody(card.id, body)
          cardStreams.clear(card.id)
        })
        .catch(() => {
          cardStreams.clear(card.id)
          updateCardBody(card.id, "AI 설정을 확인한 뒤 다시 실행하세요.")
        })
    }
  }

  useSelectionShortcuts(selectionMenu, addCard)

  const handleStructureTrigger = createStructureActionHandler({
    documentId: props.document.id,
    currentPaperTitle: props.document.title,
    viewport: props.viewport,
    viewportElement: viewportRef.current,
    worldElement: worldRef.current,
    getCards: () => cardsRef.current,
    commitCards,
    onViewportChange: props.onViewportChange,
    onCardActivated: setActiveCardId,
    onCardStream: cardStreams.append,
    onCardStreamEnd: cardStreams.clear,
    onAiRequest: props.onAiRequest,
  })

  const menuPosition = useMemo(() => {
    const firstFragment = selectionMenu?.fragments[0]
    if (!firstFragment) return null
    const screenRect = worldRectToScreen(firstFragment, { x: 0, y: 0 }, props.viewport)
    return { left: screenRect.left, top: screenRect.top - 44 }
  }, [selectionMenu, props.viewport])

  return (
    <div
      ref={viewportRef}
      className="board-viewport"
      data-tool={props.tool}
      onPointerDown={(event) => {
        if (event.target instanceof Element && !event.target.closest(".board-card"))
          setActiveCardId(null)
        if (!placePostIt(event)) startPan(event)
      }}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={handleWheel}
    >
      <PdfSurface
        document={props.document}
        viewport={props.viewport}
        onLoaded={props.onDocumentLoaded}
        onPageActive={props.onPageActive}
        onOutlineChange={props.onOutlineChange}
        onRegisterPageJump={props.onRegisterPageJump}
        onPageJump={handlePageJump}
        onStructureTrigger={handleStructureTrigger}
      />
      <div
        ref={worldRef}
        className="board-world"
        style={{
          transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.zoom})`,
        }}
      >
        <BoardOverlays.ConnectorLayer
          cards={activeCards.filter((card) => card.kind !== "sticky" && card.kind !== "highlight")}
        />
        <BoardOverlays.SourceHighlights fragments={highlightedFragments} />
        <BoardCardsLayer
          cards={cardStreams.displayCards}
          activeId={activeCardId}
          autoEditId={createdStickyId}
          zoom={props.viewport.zoom}
          onActiveChange={setActiveCardId}
          getCards={() => cardsRef.current}
          commitCards={commitCards}
          previewCards={props.onCardsPreview}
          streamingCardIds={cardStreams.streamingIds}
          onJump={props.onPageActive}
          onAsk={(card, question, history, onDelta) =>
            askBoardCard(card, question, history, props.onAiRequest, onDelta)
          }
          onRegenerateTitle={(card) => regenerateBoardCardTitle(card, props.onAiRequest)}
        />
      </div>
      {selectionMenu && menuPosition ? (
        <BoardOverlays.SelectionToolbar position={menuPosition} onAction={addCard} />
      ) : null}
      <BoardNavigationController
        key={props.document.id}
        viewport={props.viewport}
        cards={props.cards}
        currentPage={props.currentPage}
        onViewportChange={props.onViewportChange}
        visible={props.minimapVisible}
        onVisibleChange={props.onMinimapVisibleChange}
      />
    </div>
  )
}
