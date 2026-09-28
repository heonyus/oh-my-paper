import { mergeOwnSummaries } from "./ownSummary"
import type { BoardCard, DocumentInsight, DocumentRecord, Workspace } from "./schemas"
import { equalWorkspaceValue } from "./workspaceValue"

export class WorkspaceConflictError extends Error {
  readonly name = "WorkspaceConflictError"

  constructor(readonly field: string) {
    super(`Workspace conflict at ${field}; reread and resolve before saving`)
  }
}

function mergeField<T>(field: string, base: T, current: T, incoming: T): T {
  if (equalWorkspaceValue(incoming, base)) return current
  if (equalWorkspaceValue(current, base)) return incoming
  if (equalWorkspaceValue(current, incoming)) return current
  throw new WorkspaceConflictError(field)
}

function mergeDocument(
  base: DocumentRecord,
  current: DocumentRecord,
  incoming: DocumentRecord,
): DocumentRecord {
  return {
    id: current.id,
    name: mergeField("document.name", base.name, current.name, incoming.name),
    hash: current.hash,
    bytes: mergeField("document.bytes", base.bytes, current.bytes, incoming.bytes),
    importedAt: current.importedAt,
    pageCount: mergeField(
      "document.pageCount",
      base.pageCount,
      current.pageCount,
      incoming.pageCount,
    ),
    title: mergeField("document.title", base.title, current.title, incoming.title),
    authors: mergeField("document.authors", base.authors, current.authors, incoming.authors),
    year: mergeField("document.year", base.year, current.year, incoming.year),
    doi: mergeField("document.doi", base.doi, current.doi, incoming.doi),
    kind: mergeField("document.kind", base.kind, current.kind, incoming.kind),
    overview: mergeField("document.overview", base.overview, current.overview, incoming.overview),
    lastReadPage: mergeField(
      "document.lastReadPage",
      base.lastReadPage,
      current.lastReadPage,
      incoming.lastReadPage,
    ),
    quality: mergeField("document.quality", base.quality, current.quality, incoming.quality),
  }
}

function mergeCard(base: BoardCard, current: BoardCard, incoming: BoardCard): BoardCard {
  const sourceKey = mergeField(
    "card.sourceKey",
    base.sourceKey,
    current.sourceKey,
    incoming.sourceKey,
  )
  const sourceUrl = mergeField(
    "card.sourceUrl",
    base.sourceUrl,
    current.sourceUrl,
    incoming.sourceUrl,
  )
  const sourceMeta = mergeField(
    "card.sourceMeta",
    base.sourceMeta,
    current.sourceMeta,
    incoming.sourceMeta,
  )
  return {
    id: current.id,
    documentId: mergeField(
      "card.documentId",
      base.documentId,
      current.documentId,
      incoming.documentId,
    ),
    kind: mergeField("card.kind", base.kind, current.kind, incoming.kind),
    title: mergeField("card.title", base.title, current.title, incoming.title),
    body: mergeField("card.body", base.body, current.body, incoming.body),
    x: mergeField("card.x", base.x, current.x, incoming.x),
    y: mergeField("card.y", base.y, current.y, incoming.y),
    minimized: mergeField("card.minimized", base.minimized, current.minimized, incoming.minimized),
    width: mergeField("card.width", base.width, current.width, incoming.width),
    height: mergeField("card.height", base.height, current.height, incoming.height),
    loading: mergeField("card.loading", base.loading, current.loading, incoming.loading),
    chat: mergeField("card.chat", base.chat, current.chat, incoming.chat),
    anchor: mergeField("card.anchor", base.anchor, current.anchor, incoming.anchor),
    ...(sourceKey === undefined ? {} : { sourceKey }),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(sourceMeta === undefined ? {} : { sourceMeta }),
  }
}

function mergeDocuments(
  base: readonly DocumentRecord[],
  current: readonly DocumentRecord[],
  incoming: readonly DocumentRecord[],
): readonly DocumentRecord[] {
  const baseById = new Map(base.map((document) => [document.id, document]))
  const incomingById = new Map(incoming.map((document) => [document.id, document]))
  const result = new Map(current.map((document) => [document.id, document]))
  for (const document of incoming) {
    const currentDocument = result.get(document.id)
    const baseDocument = baseById.get(document.id)
    if (!currentDocument) {
      if (!baseDocument) result.set(document.id, document)
      continue
    }
    if (baseDocument)
      result.set(document.id, mergeDocument(baseDocument, currentDocument, document))
  }
  for (const document of current) {
    if (baseById.has(document.id) && !incomingById.has(document.id)) result.delete(document.id)
  }
  return [...result.values()]
}

function mergeCards(
  base: readonly BoardCard[],
  current: readonly BoardCard[],
  incoming: readonly BoardCard[],
): readonly BoardCard[] {
  const baseById = new Map(base.map((card) => [card.id, card]))
  const incomingById = new Map(incoming.map((card) => [card.id, card]))
  const result = new Map(current.map((card) => [card.id, card]))
  for (const card of incoming) {
    const currentCard = result.get(card.id)
    const baseCard = baseById.get(card.id)
    if (!currentCard) {
      if (!baseCard) result.set(card.id, card)
      continue
    }
    if (baseCard) result.set(card.id, mergeCard(baseCard, currentCard, card))
  }
  for (const card of current) {
    if (baseById.has(card.id) && !incomingById.has(card.id)) result.delete(card.id)
  }
  return [...result.values()]
}

function mergeInsights(
  base: readonly DocumentInsight[],
  current: readonly DocumentInsight[],
  incoming: readonly DocumentInsight[],
): readonly DocumentInsight[] {
  const key = (insight: DocumentInsight): string => `${insight.documentId}:${insight.kind}`
  const baseByKey = new Map(base.map((insight) => [key(insight), insight]))
  const incomingByKey = new Map(incoming.map((insight) => [key(insight), insight]))
  const result = new Map(current.map((insight) => [key(insight), insight]))
  for (const insight of incoming) {
    const currentInsight = result.get(key(insight))
    const baseInsight = baseByKey.get(key(insight))
    if (!currentInsight) {
      if (!baseInsight) result.set(key(insight), insight)
      continue
    }
    if (baseInsight) {
      result.set(key(insight), {
        documentId: currentInsight.documentId,
        kind: currentInsight.kind,
        value: mergeField("insight.value", baseInsight.value, currentInsight.value, insight.value),
        updatedAt: mergeField(
          "insight.updatedAt",
          baseInsight.updatedAt,
          currentInsight.updatedAt,
          insight.updatedAt,
        ),
      })
    }
  }
  for (const insight of current) {
    if (baseByKey.has(key(insight)) && !incomingByKey.has(key(insight))) result.delete(key(insight))
  }
  return [...result.values()]
}

export function mergeWorkspaceForSave(
  base: Workspace,
  current: Workspace,
  incoming: Workspace,
): Workspace {
  return {
    ...current,
    documents: [...mergeDocuments(base.documents, current.documents, incoming.documents)],
    cards: [...mergeCards(base.cards, current.cards, incoming.cards)],
    insights: [...mergeInsights(base.insights, current.insights, incoming.insights)],
    ownSummaries: [
      ...mergeOwnSummaries(base.ownSummaries, current.ownSummaries, incoming.ownSummaries),
    ],
    sidebarOpen: mergeField(
      "settings.sidebarOpen",
      base.sidebarOpen,
      current.sidebarOpen,
      incoming.sidebarOpen,
    ),
    outlineWidth: mergeField(
      "settings.outlineWidth",
      base.outlineWidth,
      current.outlineWidth,
      incoming.outlineWidth,
    ),
    researchSidebarWidth: mergeField(
      "settings.researchSidebarWidth",
      base.researchSidebarWidth,
      current.researchSidebarWidth,
      incoming.researchSidebarWidth,
    ),
    uiFontFamily: mergeField(
      "settings.uiFontFamily",
      base.uiFontFamily,
      current.uiFontFamily,
      incoming.uiFontFamily,
    ),
    uiFontScale: mergeField(
      "settings.uiFontScale",
      base.uiFontScale,
      current.uiFontScale,
      incoming.uiFontScale,
    ),
    theme: mergeField("settings.theme", base.theme, current.theme, incoming.theme),
    minimapVisible: mergeField(
      "settings.minimapVisible",
      base.minimapVisible,
      current.minimapVisible,
      incoming.minimapVisible,
    ),
    viewport: incoming.viewport,
    activeDocumentId: mergeField(
      "settings.activeDocumentId",
      base.activeDocumentId,
      current.activeDocumentId,
      incoming.activeDocumentId,
    ),
  }
}
