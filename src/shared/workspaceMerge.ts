import { mergeReaderNotes } from "./readerNote"
import type { BoardCard, DocumentInsight, DocumentRecord, Workspace } from "./schemas"
import { equalWorkspaceValue } from "./workspaceValue"

const CONFLICT_MESSAGE = "Workspace conflict at "

export class WorkspaceConflictError extends Error {
  readonly name = "WorkspaceConflictError"

  constructor(readonly field: string) {
    super(`${CONFLICT_MESSAGE}${field}; reread and resolve before saving`)
  }
}

/** True for a conflict thrown here, or one a backend reported by its message. */
export function isWorkspaceConflictError(error: unknown): boolean {
  return (
    error instanceof WorkspaceConflictError ||
    (error instanceof Error && error.message.startsWith(CONFLICT_MESSAGE))
  )
}

/**
 * What a field gets when the base, the current and the incoming values all differ: a save is
 * refused (`reject`), or the incoming side's edit wins (`keepIncoming`), as it does for a whole
 * record in `mergeKeyedRecords`.
 */
type ConflictPolicy = "reject" | "keepIncoming"

function mergeField<T>(policy: ConflictPolicy, field: string, base: T, current: T, incoming: T): T {
  if (equalWorkspaceValue(incoming, base)) return current
  if (equalWorkspaceValue(current, base)) return incoming
  if (equalWorkspaceValue(current, incoming)) return current
  if (policy === "keepIncoming") return incoming
  throw new WorkspaceConflictError(field)
}

function mergeDocument(
  policy: ConflictPolicy,
  base: DocumentRecord,
  current: DocumentRecord,
  incoming: DocumentRecord,
): DocumentRecord {
  const lastReadPage = mergeField(
    policy,
    "document.lastReadPage",
    base.lastReadPage,
    current.lastReadPage,
    incoming.lastReadPage,
  )
  return {
    id: current.id,
    name: mergeField(policy, "document.name", base.name, current.name, incoming.name),
    hash: current.hash,
    bytes: mergeField(policy, "document.bytes", base.bytes, current.bytes, incoming.bytes),
    importedAt: current.importedAt,
    pageCount: mergeField(
      policy,
      "document.pageCount",
      base.pageCount,
      current.pageCount,
      incoming.pageCount,
    ),
    title: mergeField(policy, "document.title", base.title, current.title, incoming.title),
    authors: mergeField(
      policy,
      "document.authors",
      base.authors,
      current.authors,
      incoming.authors,
    ),
    year: mergeField(policy, "document.year", base.year, current.year, incoming.year),
    doi: mergeField(policy, "document.doi", base.doi, current.doi, incoming.doi),
    kind: mergeField(policy, "document.kind", base.kind, current.kind, incoming.kind),
    overview: mergeField(
      policy,
      "document.overview",
      base.overview,
      current.overview,
      incoming.overview,
    ),
    // An unread paper has no key at all; an own `undefined` would make every save rewrite it.
    ...(lastReadPage === undefined ? {} : { lastReadPage }),
    quality: mergeField(
      policy,
      "document.quality",
      base.quality,
      current.quality,
      incoming.quality,
    ),
  }
}

function mergeCard(
  policy: ConflictPolicy,
  base: BoardCard,
  current: BoardCard,
  incoming: BoardCard,
): BoardCard {
  const sourceKey = mergeField(
    policy,
    "card.sourceKey",
    base.sourceKey,
    current.sourceKey,
    incoming.sourceKey,
  )
  const sourceUrl = mergeField(
    policy,
    "card.sourceUrl",
    base.sourceUrl,
    current.sourceUrl,
    incoming.sourceUrl,
  )
  const sourceMeta = mergeField(
    policy,
    "card.sourceMeta",
    base.sourceMeta,
    current.sourceMeta,
    incoming.sourceMeta,
  )
  const example = mergeField(
    policy,
    "card.example",
    base.example,
    current.example,
    incoming.example,
  )
  return {
    id: current.id,
    documentId: mergeField(
      policy,
      "card.documentId",
      base.documentId,
      current.documentId,
      incoming.documentId,
    ),
    kind: mergeField(policy, "card.kind", base.kind, current.kind, incoming.kind),
    title: mergeField(policy, "card.title", base.title, current.title, incoming.title),
    body: mergeField(policy, "card.body", base.body, current.body, incoming.body),
    x: mergeField(policy, "card.x", base.x, current.x, incoming.x),
    y: mergeField(policy, "card.y", base.y, current.y, incoming.y),
    minimized: mergeField(
      policy,
      "card.minimized",
      base.minimized,
      current.minimized,
      incoming.minimized,
    ),
    width: mergeField(policy, "card.width", base.width, current.width, incoming.width),
    height: mergeField(policy, "card.height", base.height, current.height, incoming.height),
    loading: mergeField(policy, "card.loading", base.loading, current.loading, incoming.loading),
    chat: mergeField(policy, "card.chat", base.chat, current.chat, incoming.chat),
    anchor: mergeField(policy, "card.anchor", base.anchor, current.anchor, incoming.anchor),
    ...(sourceKey === undefined ? {} : { sourceKey }),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(sourceMeta === undefined ? {} : { sourceMeta }),
    ...(example === undefined ? {} : { example }),
    // When the card was first saved is the library's to say; no edit moves it.
    ...(current.createdAt === undefined ? {} : { createdAt: current.createdAt }),
  }
}

function mergeDocuments(
  policy: ConflictPolicy,
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
      result.set(document.id, mergeDocument(policy, baseDocument, currentDocument, document))
  }
  for (const document of current) {
    if (baseById.has(document.id) && !incomingById.has(document.id)) result.delete(document.id)
  }
  return [...result.values()]
}

function mergeCards(
  policy: ConflictPolicy,
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
    if (baseCard) result.set(card.id, mergeCard(policy, baseCard, currentCard, card))
  }
  for (const card of current) {
    if (baseById.has(card.id) && !incomingById.has(card.id)) result.delete(card.id)
  }
  return [...result.values()]
}

function mergeInsights(
  policy: ConflictPolicy,
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
        value: mergeField(
          policy,
          "insight.value",
          baseInsight.value,
          currentInsight.value,
          insight.value,
        ),
        updatedAt: mergeField(
          policy,
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

function mergeWorkspace(
  policy: ConflictPolicy,
  base: Workspace,
  current: Workspace,
  incoming: Workspace,
): Workspace {
  return {
    ...current,
    documents: [...mergeDocuments(policy, base.documents, current.documents, incoming.documents)],
    cards: [...mergeCards(policy, base.cards, current.cards, incoming.cards)],
    insights: [...mergeInsights(policy, base.insights, current.insights, incoming.insights)],
    readerNotes: [...mergeReaderNotes(base.readerNotes, current.readerNotes, incoming.readerNotes)],
    sidebarOpen: mergeField(
      policy,
      "settings.sidebarOpen",
      base.sidebarOpen,
      current.sidebarOpen,
      incoming.sidebarOpen,
    ),
    outlineWidth: mergeField(
      policy,
      "settings.outlineWidth",
      base.outlineWidth,
      current.outlineWidth,
      incoming.outlineWidth,
    ),
    researchSidebarWidth: mergeField(
      policy,
      "settings.researchSidebarWidth",
      base.researchSidebarWidth,
      current.researchSidebarWidth,
      incoming.researchSidebarWidth,
    ),
    uiFontFamily: mergeField(
      policy,
      "settings.uiFontFamily",
      base.uiFontFamily,
      current.uiFontFamily,
      incoming.uiFontFamily,
    ),
    uiFontScale: mergeField(
      policy,
      "settings.uiFontScale",
      base.uiFontScale,
      current.uiFontScale,
      incoming.uiFontScale,
    ),
    theme: mergeField(policy, "settings.theme", base.theme, current.theme, incoming.theme),
    minimapVisible: mergeField(
      policy,
      "settings.minimapVisible",
      base.minimapVisible,
      current.minimapVisible,
      incoming.minimapVisible,
    ),
    viewport: incoming.viewport,
    activeDocumentId: mergeField(
      policy,
      "settings.activeDocumentId",
      base.activeDocumentId,
      current.activeDocumentId,
      incoming.activeDocumentId,
    ),
  }
}

/** Three-way merge of a save onto the current workspace; a field both sides changed is refused. */
export function mergeWorkspaceForSave(
  base: Workspace,
  current: Workspace,
  incoming: Workspace,
): Workspace {
  return mergeWorkspace("reject", base, current, incoming)
}

/**
 * The same merge for a save that was refused: a field both sides changed keeps the incoming
 * side's edit, so the reader's own change is what gets saved rather than nothing at all.
 */
export function resolveWorkspaceConflicts(
  base: Workspace,
  current: Workspace,
  incoming: Workspace,
): Workspace {
  return mergeWorkspace("keepIncoming", base, current, incoming)
}
