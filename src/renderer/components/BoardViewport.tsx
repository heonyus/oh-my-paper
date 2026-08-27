import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AiRequest } from "../../shared/ipc"
import { CARD_WIDTH, createSelectionCard, saveTranslationAsNote } from "../lib/board"
import { type BoardTextSelection, captureNativeBoardTextSelection } from "../lib/boardSelection"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import { useSelectionShortcuts } from "../lib/selectionActions"
import { addSelectionContext } from "../lib/selectionContext"
import { worldRectToScreen } from "../lib/selectionGeometry"
import { createStructureActionHandler } from "../lib/structureActions"
import { useBoardGestures } from "../lib/useBoardGestures"
import { revealWorldRectHorizontally } from "../lib/viewport"
import type { BoardCard, BoardTool, CardId, DocumentRecord, Viewport } from "../types"
import { BoardCard as BoardCardView } from "./BoardCard"
import {
  ConnectorLayer,
  collectHighlightFragments,
  type SelectionAction,
  SelectionToolbar,
  SourceHighlights,
} from "./BoardOverlays"
import type { PreparedSummary } from "./PdfColumn"
import { PdfSurface } from "./PdfSurface"

type BoardViewportProps = {
  readonly document: DocumentRecord
  readonly viewport: Viewport
  readonly cards: readonly BoardCard[]
  readonly onViewportChange: (viewport: Viewport) => void
  readonly onCardsChange: (cards: readonly BoardCard[]) => void
  readonly onDocumentLoaded: (summary: PreparedSummary) => void
  readonly onPageActive: (page: number) => void
  readonly onOutlineChange?: ((outline: readonly PdfOutlineEntry[]) => void) | undefined
  readonly onRegisterPageJump?: ((jump: (page: number) => void) => void) | undefined
  readonly onAiRequest: (request: Omit<AiRequest, "documentId">) => Promise<string>
  readonly tool: BoardTool
}

export function BoardViewport(props: BoardViewportProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const viewportStateRef = useRef(props.viewport)
  const cardsRef = useRef(props.cards)
  const [selectionMenu, setSelectionMenu] = useState<BoardTextSelection | null>(null)
  const [activeCardId, setActiveCardId] = useState<CardId | null>(null)

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
  }, [props.viewport])
  useEffect(() => {
    cardsRef.current = props.cards
  }, [props.cards])

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

  const activeCards = props.cards.filter((card) => card.id === activeCardId)

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
  const persistentHighlights = props.cards
    .filter((card) => card.kind === "highlight")
    .flatMap((card) => card.anchor.fragments)
  const highlightedFragments = collectHighlightFragments(
    activeCards.filter((card) => card.kind !== "highlight"),
    persistentHighlights,
  )

  function commitCards(cards: readonly BoardCard[]): void {
    cardsRef.current = cards
    props.onCardsChange(cards)
  }

  function updateCardBody(id: CardId, body: string): void {
    commitCards(cardsRef.current.map((card) => (card.id === id ? { ...card, body } : card)))
  }

  function addCard(kind: SelectionAction): void {
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
    if (kind !== "note" && kind !== "highlight") {
      void props
        .onAiRequest({
          action: kind,
          page: selectionMenu.page,
          quote: selectionMenu.quote,
          before: selectionMenu.context.before,
          after: selectionMenu.context.after,
        })
        .then((body) => updateCardBody(card.id, body))
        .catch(() => updateCardBody(card.id, "OpenAI API 키를 설정한 뒤 다시 실행하세요."))
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
      onPointerDown={startPan}
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
        <ConnectorLayer cards={activeCards} />
        <SourceHighlights fragments={highlightedFragments} />
        {props.cards.map((card) => (
          <BoardCardView
            key={card.id}
            card={card}
            active={card.id === activeCardId}
            zoom={props.viewport.zoom}
            onActiveChange={setActiveCardId}
            onMove={(id, x, y) =>
              commitCards(cardsRef.current.map((c) => (c.id === id ? { ...c, x, y } : c)))
            }
            onDelete={(id) => {
              if (activeCardId === id) setActiveCardId(null)
              commitCards(cardsRef.current.filter((c) => c.id !== id))
            }}
            onConvertToNote={(id) =>
              commitCards(cardsRef.current.map((c) => (c.id === id ? saveTranslationAsNote(c) : c)))
            }
            onJump={props.onPageActive}
          />
        ))}
      </div>
      {selectionMenu && menuPosition ? (
        <SelectionToolbar position={menuPosition} onAction={addCard} />
      ) : null}
      <div className="board-hint">두 손가락으로 이동 · 핀치하여 확대/축소</div>
    </div>
  )
}
