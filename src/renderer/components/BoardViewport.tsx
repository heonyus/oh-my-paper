import {
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { CARD_WIDTH, clearOfCards, createSelectionCard, drawnOnPassage } from "../lib/board"
import { askBoardCard, regenerateBoardCardTitle } from "../lib/boardCardAi"
import { boardHighlightState, highlightAtPoint, translationAtPoint } from "../lib/boardHighlights"
import { type BoardTextSelection, captureNativeBoardTextSelection } from "../lib/boardSelection"
import { parsedCardResponse, parsedTranslationResponse } from "../lib/cardPresentation"
import { useLocale, useTranslator } from "../lib/locale"
import { useSelectionShortcuts } from "../lib/selectionActions"
import { selectionAiRequest } from "../lib/selectionAiRequest"
import { addSelectionContext } from "../lib/selectionContext"
import { worldRectToScreen } from "../lib/selectionGeometry"
import { createStructureActionHandler } from "../lib/structureActions"
import { useBoardGestures } from "../lib/useBoardGestures"
import { useBoardPanPreview } from "../lib/useBoardPanPreview"
import { useCardStreams } from "../lib/useCardStreams"
import { usePageJump } from "../lib/usePageJump"
import { usePanConstraint } from "../lib/usePanConstraint"
import { mostVisiblePage, revealWorldRectHorizontally } from "../lib/viewport"
import { boardMessages } from "../messages/board"
import type { BoardCard, CardId, SourceFragment } from "../types"
import { BoardCardsLayer } from "./BoardCardsLayer"
import { BoardNavigationController } from "./BoardNavigationController"
import * as BoardOverlays from "./BoardOverlays"
import type { BoardViewportProps } from "./BoardViewportProps"
import { PdfSurface } from "./PdfSurface"
import { type PeekAnchor, type PeekBounds, TranslationPeek } from "./TranslationPeek"

/** The peek stays a moment after the pointer leaves, so it can be reached to copy or remove. */
const PEEK_HIDE_DELAY_MS = 180
const PEEK_EDGE = 8
/** A hovered fragment narrower than this is a word or two, and the peek centres on it. */
const PEEK_WORD_WIDTH = 220

type TranslationHover = {
  readonly id: CardId
  /** The line the pointer came in on, and where along it, in board coordinates. */
  readonly line: SourceFragment
  readonly x: number
}

type BoardWorldStyle = CSSProperties & { readonly "--board-zoom": number }

/** Cards counter-scale their text by `--board-zoom` so it reads at the same size as the sidebar. */
function boardWorldStyle(viewport: {
  readonly x: number
  readonly y: number
  readonly zoom: number
}): BoardWorldStyle {
  return {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    "--board-zoom": viewport.zoom,
  }
}

export function BoardViewport(props: BoardViewportProps): JSX.Element {
  const { locale } = useLocale()
  const t = useTranslator(boardMessages)
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const viewportStateRef = useRef(props.viewport)
  const visiblePageFrameRef = useRef<number | null>(null)
  const pageReportPendingRef = useRef(false)
  const cardsRef = useRef(props.cards)
  const [selectionMenu, setSelectionMenu] = useState<BoardTextSelection | null>(null)
  const [activeCardId, setActiveCardId] = useState<CardId | null>(null)
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null)
  const pointerDownRef = useRef<{ readonly x: number; readonly y: number } | null>(null)
  const [createdMemoId, setCreatedMemoId] = useState<CardId | null>(null)
  const [translationHover, setTranslationHover] = useState<TranslationHover | null>(null)
  const peekHideTimer = useRef<number | undefined>(undefined)
  const cardStreams = useCardStreams(props.cards)
  const panConstraint = usePanConstraint()
  const handlePageJump = usePageJump(viewportStateRef, viewportRef, props.onViewportChange)
  const previewPan = useBoardPanPreview(viewportStateRef, worldRef, viewportRef)
  const reportVisiblePage = useCallback((): void => {
    if (visiblePageFrameRef.current !== null)
      window.cancelAnimationFrame(visiblePageFrameRef.current)
    visiblePageFrameRef.current = window.requestAnimationFrame(() => {
      visiblePageFrameRef.current = null
      const board = viewportRef.current
      if (!board) return
      const boardRect = board.getBoundingClientRect()
      const pages = [...board.querySelectorAll<HTMLElement>(".pdfViewer .page")].flatMap((page) => {
        const pageNumber = Number(page.getAttribute("data-page-number"))
        if (!Number.isInteger(pageNumber) || pageNumber < 1) return []
        const rect = page.getBoundingClientRect()
        return [{ page: pageNumber, top: rect.top, bottom: rect.bottom }]
      })
      const bestPage = mostVisiblePage(boardRect.top, boardRect.bottom, pages)
      if (bestPage !== null) props.onPageActive(bestPage)
    })
  }, [props.onPageActive])

  const markPageReportPending = useCallback((): void => {
    pageReportPendingRef.current = true
  }, [])

  const { startPan, movePan, endPan, panning } = useBoardGestures({
    wheelTargetRef: viewportRef,
    viewport: props.viewport,
    onViewportChange: props.onViewportChange,
    onPanPreview: previewPan,
    onPanCommit: markPageReportPending,
    constrainPan: panConstraint.constrain,
    onClearSelection: () => {
      setSelectionMenu(null)
      setActiveCardId(null)
    },
    tool: props.tool,
  })
  const displayViewport = panning ? viewportStateRef.current : props.viewport

  useLayoutEffect(() => {
    // DOM page geometry must be sampled after this viewport has committed.
    void props.viewport
    if (!pageReportPendingRef.current || panning) return
    pageReportPendingRef.current = false
    reportVisiblePage()
  }, [panning, props.viewport, reportVisiblePage])

  useEffect(() => {
    viewportStateRef.current = props.viewport
    cardsRef.current = props.cards
  }, [props.viewport, props.cards])

  useEffect(
    () => () => {
      if (visiblePageFrameRef.current !== null)
        window.cancelAnimationFrame(visiblePageFrameRef.current)
    },
    [],
  )

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

  const {
    activeCards,
    fragments: highlightedFragments,
    highlights,
    translations,
  } = boardHighlightState(props.cards, activeCardId)
  const selectedHighlight = highlights.find((card) => card.id === selectedHighlightId) ?? null
  const peekCard = translations.find((card) => card.id === translationHover?.id) ?? null

  const keepPeek = useCallback((): void => window.clearTimeout(peekHideTimer.current), [])
  const hidePeekSoon = useCallback((): void => {
    window.clearTimeout(peekHideTimer.current)
    peekHideTimer.current = window.setTimeout(() => setTranslationHover(null), PEEK_HIDE_DELAY_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(peekHideTimer.current), [])

  /** Hovering a translated passage, with no button held, shows its translation. */
  function trackTranslationHover(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.buttons !== 0 || panning) return
    if (event.target instanceof Element && event.target.closest(".translation-peek")) return
    const world = worldRef.current
    if (!world) return
    // Measured from the drawn board, which also counts any scroll the browser gave the viewport.
    const origin = world.getBoundingClientRect()
    const { zoom } = viewportStateRef.current
    const point = {
      x: (event.clientX - origin.left) / zoom,
      y: (event.clientY - origin.top) / zoom,
    }
    const hit = translationAtPoint(translations, point)
    if (!hit) {
      if (translationHover) hidePeekSoon()
      return
    }
    keepPeek()
    if (translationHover?.id !== hit.card.id)
      setTranslationHover({ id: hit.card.id, line: hit.line, x: point.x })
  }

  function commitCards(cards: readonly BoardCard[]): void {
    cardsRef.current = cards
    props.onCardsChange(cards)
  }

  function updateCardBody(id: CardId, body: string): void {
    commitCards(
      cardsRef.current.map((card) => {
        if (card.id !== id) return card
        const parsed =
          card.kind === "translation"
            ? parsedTranslationResponse(body, card.anchor.quote)
            : parsedCardResponse(body, card.title)
        return { ...card, ...parsed, loading: false }
      }),
    )
  }

  function addCard(kind: BoardOverlays.SelectionAction): void {
    if (!selectionMenu) return
    if (kind === "note" && props.onQuoteToNote) {
      props.onQuoteToNote(selectionMenu.page, selectionMenu.quote)
      setSelectionMenu(null)
      window.getSelection()?.removeAllRanges()
      return
    }
    const created = createSelectionCard(props.document.id, selectionMenu, kind, locale)
    if (!created) return
    const card = clearOfCards(created, cardsRef.current)
    const boardWidth = viewportRef.current?.clientWidth
    // A translation is drawn on the passage, so there is no card beside the page to bring into view.
    if (boardWidth && !drawnOnPassage(card)) {
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
    if (kind === "note") setCreatedMemoId(card.id)
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    const request = selectionAiRequest(kind, selectionMenu)
    if (request) {
      void props
        .onAiRequest(request, (delta) => {
          // Half-received HTML would render as raw markup, so infographics wait for the whole body.
          if (kind !== "translation" && kind !== "infographic") cardStreams.append(card.id, delta)
        })
        .then((body) => {
          updateCardBody(card.id, body)
          cardStreams.clear(card.id)
        })
        .catch(() => {
          cardStreams.clear(card.id)
          // Stored as the card's body and read back as a translation, which keeps only Korean
          // meanings (see cardPresentation), so it is not translated yet.
          updateCardBody(card.id, "AI 설정을 확인한 뒤 다시 실행하세요.")
        })
    }
  }

  useSelectionShortcuts(selectionMenu, addCard)

  const deleteHighlight = useCallback(
    (id: string): void => {
      setSelectedHighlightId(null)
      const next = cardsRef.current.filter((card) => card.id !== id)
      cardsRef.current = next
      props.onCardsChange(next)
    },
    [props.onCardsChange],
  )

  useEffect(() => {
    if (!selectedHighlight) return
    const id = selectedHighlight.id
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select"))
      )
        return
      if (event.key === "Escape") setSelectedHighlightId(null)
      else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        deleteHighlight(id)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedHighlight, deleteHighlight])

  /** A plain click (no drag, no text selected) on a highlight selects it. */
  function selectHighlightAt(event: ReactPointerEvent<HTMLDivElement>): void {
    const start = pointerDownRef.current
    pointerDownRef.current = null
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return
    if (
      event.target instanceof Element &&
      event.target.closest("button, .board-card, .selection-menu")
    )
      return
    if (!(window.getSelection()?.isCollapsed ?? true) || !worldRef.current) return
    setSelectedHighlightId(
      highlightAtPoint(worldRef.current, { x: event.clientX, y: event.clientY }),
    )
  }

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
    locale,
  })

  const menuPosition = useMemo(() => {
    const firstFragment = selectionMenu?.fragments[0]
    if (!firstFragment) return null
    const screenRect = worldRectToScreen(firstFragment, { x: 0, y: 0 }, props.viewport)
    return { left: screenRect.left, top: screenRect.top - 44 }
  }, [selectionMenu, props.viewport])

  const peekAnchor = useMemo((): PeekAnchor | null => {
    if (!translationHover) return null
    const line = worldRectToScreen(translationHover.line, { x: 0, y: 0 }, displayViewport)
    const pointer = displayViewport.x + translationHover.x * displayViewport.zoom
    return {
      x: line.width <= PEEK_WORD_WIDTH ? line.left + line.width / 2 : pointer,
      top: line.top,
      bottom: line.top + line.height,
    }
  }, [translationHover, displayViewport])
  // The peek is placed in the viewport's content, which the browser may have scrolled.
  const peekBounds = useMemo((): PeekBounds | null => {
    const board = viewportRef.current
    if (!peekAnchor || !board) return null
    return {
      left: board.scrollLeft + PEEK_EDGE,
      right: board.scrollLeft + board.clientWidth - PEEK_EDGE,
      top: board.scrollTop + PEEK_EDGE,
    }
  }, [peekAnchor])

  const highlightMenuPosition = useMemo(() => {
    const firstFragment = selectedHighlight?.anchor.fragments[0]
    if (!firstFragment) return null
    const screenRect = worldRectToScreen(firstFragment, { x: 0, y: 0 }, props.viewport)
    return { left: screenRect.left, top: screenRect.top - 44 }
  }, [selectedHighlight, props.viewport])

  return (
    <div
      ref={viewportRef}
      className="board-viewport"
      data-tool={props.tool}
      data-document-hash={props.document.hash}
      onPointerDown={(event) => {
        pointerDownRef.current = { x: event.clientX, y: event.clientY }
        setSelectedHighlightId(null)
        setTranslationHover(null)
        if (event.target instanceof Element && !event.target.closest(".board-card"))
          setActiveCardId(null)
        startPan(event)
      }}
      onPointerMove={(event) => {
        movePan(event)
        trackTranslationHover(event)
      }}
      onPointerLeave={() => {
        if (translationHover) hidePeekSoon()
      }}
      onPointerUp={(event) => {
        endPan(event)
        selectHighlightAt(event)
      }}
      onPointerCancel={endPan}
    >
      <PdfSurface
        document={props.document}
        viewport={displayViewport}
        onLoaded={props.onDocumentLoaded}
        onPageActive={props.onPageActive}
        onOutlineChange={props.onOutlineChange}
        onRegisterPageJump={props.onRegisterPageJump}
        onPageJump={handlePageJump}
        onStructureTrigger={handleStructureTrigger}
      />
      <div ref={worldRef} className="board-world" style={boardWorldStyle(displayViewport)}>
        <BoardOverlays.ConnectorLayer
          cards={activeCards.filter((card) => card.kind !== "sticky" && !drawnOnPassage(card))}
        />
        <BoardOverlays.HighlightMarks highlights={highlights} selectedId={selectedHighlightId} />
        <BoardOverlays.TranslationMarks
          translations={translations}
          hoveredId={translationHover?.id ?? null}
        />
        <BoardOverlays.SourceHighlights fragments={highlightedFragments} />
        <BoardOverlays.SourceHighlights
          fragments={(props.evidenceFocus?.fragments ?? []).map((fragment, index) => ({
            key: `evidence-${index}`,
            fragment,
          }))}
        />
        <BoardCardsLayer
          cards={cardStreams.displayCards}
          activeId={activeCardId}
          autoEditId={createdMemoId}
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
      {peekCard && peekAnchor && peekBounds ? (
        <TranslationPeek
          card={peekCard}
          anchor={peekAnchor}
          bounds={peekBounds}
          onPointerEnter={keepPeek}
          onPointerLeave={hidePeekSoon}
          onDelete={() => {
            setTranslationHover(null)
            deleteHighlight(peekCard.id)
          }}
        />
      ) : null}
      {selectedHighlight && highlightMenuPosition ? (
        <BoardOverlays.HighlightToolbar
          position={highlightMenuPosition}
          onDelete={() => deleteHighlight(selectedHighlight.id)}
        />
      ) : null}
      {props.evidenceFocus ? (
        <div className="evidence-return" role="status">
          <span>
            {t("evidence.page", { page: props.evidenceFocus.page })} ·{" "}
            {props.evidenceFocus.fragments.length > 0
              ? t("evidence.linked")
              : t("evidence.noPosition")}
          </span>
          <button type="button" onClick={props.onDismissEvidence}>
            {t("evidence.dismiss")}
          </button>
        </div>
      ) : null}
      <BoardNavigationController
        key={props.document.id}
        viewport={props.viewport}
        cards={props.cards}
        currentPage={props.currentPage}
        pageCount={props.document.pageCount}
        onViewportChange={props.onViewportChange}
        visible={props.minimapVisible}
        onVisibleChange={props.onMinimapVisibleChange}
        panning={panning}
        panConstraintRef={panConstraint.constraintRef}
        occludedRight={props.rightOcclusion}
      />
    </div>
  )
}
