import { pageIdSchema, type SourceDocumentAst } from "../../shared/documentAst"
import type { SourceFragment } from "../../shared/schemas"
import { rectsToElementSpace, type ScreenRect } from "./selectionGeometry"
import type { SemanticDocumentAst, SemanticNodeId } from "./semanticDocumentAst"

export type RenderedPageGeometry = {
  readonly pageId: string
  readonly pageElement: HTMLElement
  readonly pageBounds: ScreenRect
  readonly canvasBounds: ScreenRect | null
  readonly textLayerBounds: ScreenRect | null
}

export type RenderedNodeGeometry =
  | {
      readonly status: "resolved"
      readonly nodeId: SemanticNodeId
      readonly pageId: string
      readonly bounds: readonly SourceFragment[]
      readonly screenRects: readonly ScreenRect[]
      readonly textSpanIds: readonly string[]
    }
  | {
      readonly status: "unresolved"
      readonly nodeId: SemanticNodeId
      readonly pageId: string
      readonly reason: "page_not_rendered" | "no_matching_text_spans" | "source_provenance_missing"
    }

export type RenderedDocumentGeometry = {
  readonly sourceHash: string
  readonly zoom: number
  readonly pages: readonly RenderedPageGeometry[]
  readonly nodes: ReadonlyMap<SemanticNodeId, RenderedNodeGeometry>
}

export type LiveSelectionGeometry =
  | {
      readonly status: "resolved"
      readonly nodeId: SemanticNodeId
      readonly pageId: string
      readonly bounds: readonly SourceFragment[]
      readonly screenRects: readonly ScreenRect[]
    }
  | {
      readonly status: "unresolved"
      readonly nodeId: SemanticNodeId
      readonly reason: "unknown_semantic_node" | "page_mismatch" | "empty_selection"
    }

type LiveSelectionRange = {
  readonly getClientRects: () => readonly ScreenRect[]
}

function screenRect(element: Element): ScreenRect {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function pageIdFor(element: HTMLElement): string | null {
  const pageNumber = element.getAttribute("data-page-number")
  const parsed = pageIdSchema.safeParse(`page:${pageNumber ?? ""}`)
  return parsed.success ? parsed.data : null
}

function sourceItemIdsForSpan(span: HTMLSpanElement, source: SourceDocumentAst, pageId: string) {
  const explicit = span.getAttribute("data-ast-source-item-id")
  if (explicit) {
    return explicit
      .split(",")
      .map((value) => source.items.find((item) => item.id === value && item.pageId === pageId)?.id)
      .filter((value): value is SourceDocumentAst["items"][number]["id"] => value !== undefined)
  }
  const text = span.textContent?.trim() ?? ""
  const matches = source.items.filter((item) => item.pageId === pageId && item.text.trim() === text)
  return matches.length === 1 ? [matches[0]?.id].filter((id) => id !== undefined) : []
}

function pageGeometry(pageElement: HTMLElement, pageId: string): RenderedPageGeometry {
  const pageBounds = screenRect(pageElement)
  const canvas = pageElement.querySelector<HTMLCanvasElement>(".canvasWrapper canvas")
  const textLayer = pageElement.querySelector<HTMLElement>(".textLayer")
  return {
    pageId,
    pageElement,
    pageBounds,
    canvasBounds: canvas ? screenRect(canvas) : null,
    textLayerBounds: textLayer ? screenRect(textLayer) : null,
  }
}

function spanGeometry(
  page: RenderedPageGeometry,
  source: SourceDocumentAst,
): readonly {
  readonly id: string
  readonly sourceItemIds: readonly string[]
  readonly rect: ScreenRect
}[] {
  return Array.from(page.pageElement.querySelectorAll<HTMLSpanElement>(".textLayer span")).flatMap(
    (span, index) => {
      const rect = screenRect(span)
      if (rect.width <= 0 || rect.height <= 0) return []
      return [
        {
          id: span.getAttribute("data-ast-span-id") ?? `span:${page.pageId}:${index}`,
          sourceItemIds: sourceItemIdsForSpan(span, source, page.pageId),
          rect,
        },
      ]
    },
  )
}

export function mapRenderedDocumentGeometry(input: {
  readonly source: SourceDocumentAst
  readonly semantic: SemanticDocumentAst
  readonly pageElements: readonly HTMLElement[]
  readonly zoom: number
}): RenderedDocumentGeometry {
  const pages = input.pageElements.flatMap((element) => {
    const pageId = pageIdFor(element)
    return pageId ? [pageGeometry(element, pageId)] : []
  })
  const pageById = new Map(
    pages.map((page): readonly [string, RenderedPageGeometry] => [page.pageId, page]),
  )
  const nodes = new Map<SemanticNodeId, RenderedNodeGeometry>()
  for (const node of input.semantic.nodes) {
    const page = pageById.get(node.pageId)
    if (!page) {
      nodes.set(node.id, {
        status: "unresolved",
        nodeId: node.id,
        pageId: node.pageId,
        reason: "page_not_rendered",
      })
      continue
    }
    if (node.sourceItemIds.length === 0) {
      nodes.set(node.id, {
        status: "unresolved",
        nodeId: node.id,
        pageId: node.pageId,
        reason: "source_provenance_missing",
      })
      continue
    }
    const spans = spanGeometry(page, input.source).filter((span) =>
      span.sourceItemIds.some((id) => node.sourceItemIds.includes(id)),
    )
    const screenRects = spans.map((span) => span.rect)
    const sourcePage = input.source.pages.find((candidate) => candidate.id === node.pageId)
    const bounds = sourcePage ? rectsToElementSpace(screenRects, page.pageBounds, sourcePage) : []
    nodes.set(
      node.id,
      bounds.length > 0
        ? {
            status: "resolved",
            nodeId: node.id,
            pageId: node.pageId,
            bounds,
            screenRects,
            textSpanIds: spans.map((span) => span.id),
          }
        : {
            status: "unresolved",
            nodeId: node.id,
            pageId: node.pageId,
            reason: "no_matching_text_spans",
          },
    )
  }
  return { sourceHash: input.semantic.sourceHash, zoom: input.zoom, pages, nodes }
}

export function mapLiveSelectionGeometry(input: {
  readonly nodeId: SemanticNodeId
  readonly pageElement: HTMLElement
  readonly range: LiveSelectionRange
  readonly pageSize: { readonly width: number; readonly height: number }
}): LiveSelectionGeometry {
  const pageId = pageIdFor(input.pageElement)
  if (!pageId) return { status: "unresolved", nodeId: input.nodeId, reason: "page_mismatch" }
  const screenRects = input.range
    .getClientRects()
    .filter((rect) => rect.width > 0 && rect.height > 0)
  const bounds = rectsToElementSpace(screenRects, screenRect(input.pageElement), input.pageSize)
  return bounds.length > 0
    ? { status: "resolved", nodeId: input.nodeId, pageId, bounds, screenRects }
    : { status: "unresolved", nodeId: input.nodeId, reason: "empty_selection" }
}

export class RenderedDocumentGeometrySession {
  readonly #source: SourceDocumentAst
  readonly #semantic: SemanticDocumentAst
  #current: RenderedDocumentGeometry | null = null

  constructor(source: SourceDocumentAst, semantic: SemanticDocumentAst) {
    this.#source = source
    this.#semantic = semantic
  }

  refresh(pageElements: readonly HTMLElement[], zoom: number): RenderedDocumentGeometry {
    this.#current = mapRenderedDocumentGeometry({
      source: this.#source,
      semantic: this.#semantic,
      pageElements,
      zoom,
    })
    return this.#current
  }

  get current(): RenderedDocumentGeometry | null {
    return this.#current
  }
}
