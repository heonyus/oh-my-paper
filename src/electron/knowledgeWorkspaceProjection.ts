import type { DatabaseSync } from "node:sqlite"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import type { BoardCard, DocumentInsight, DocumentRecord, Workspace } from "../shared/schemas"
import {
  boardCardSchema,
  documentIdSchema,
  documentInsightKindSchema,
  documentInsightSchema,
  documentRecordSchema,
  sourceAnchorSchema,
  workspaceSchema,
} from "../shared/schemas"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { insightRowSchema, workspaceSettingsRowSchema } from "./knowledgeRepositoryRows"

const cardMetaSchema = boardCardSchema
  .pick({
    chat: true,
    loading: true,
    sourceKey: true,
    sourceUrl: true,
    sourceMeta: true,
    ownCheck: true,
  })
  .partial()
  .extend({
    documentId: documentIdSchema.optional(),
    cardKind: boardCardSchema.shape.kind.optional(),
    anchor: sourceAnchorSchema.optional(),
  })

function findAllPaperNodes(repo: KnowledgeRepository): readonly KnowledgeNode[] {
  const papers: KnowledgeNode[] = []
  let offset = 0
  while (true) {
    const page = repo.findNodes({ kind: "paper", limit: 100, offset })
    papers.push(...page)
    if (page.length < 100) return papers
    offset += page.length
  }
}

export function projectRepositoryToWorkspace(
  repo: KnowledgeRepository,
  db: DatabaseSync,
): Workspace {
  const rawSettings = db.prepare("SELECT * FROM workspace_settings WHERE id = 1").get()
  const settingsRow = rawSettings ? workspaceSettingsRowSchema.parse(rawSettings) : undefined

  const defaultBoard = repo.getOrCreateDefaultBoard()
  const placements = repo.findPlacementsForBoard(defaultBoard.id)

  const cards: BoardCard[] = []
  for (const placement of placements) {
    const node = repo.getNode(placement.nodeId)
    if (!node) continue

    const cardMetaParsed = cardMetaSchema.safeParse(node.metadata)
    const cardMeta = cardMetaParsed.success ? cardMetaParsed.data : {}
    const documentId = cardMeta.documentId
    if (!documentId) continue

    const anchor = cardMeta.anchor
    if (!anchor) continue

    cards.push(
      boardCardSchema.parse({
        id: placement.cardId ?? placement.id,
        documentId: documentIdSchema.parse(documentId),
        kind: cardMeta.cardKind ?? "note",
        title: node.title,
        body: node.body,
        x: placement.x,
        y: placement.y,
        minimized: placement.minimized,
        width: placement.width,
        height: placement.height,
        loading: Boolean(cardMeta.loading),
        chat: cardMeta.chat ?? [],
        sourceKey: cardMeta.sourceKey,
        sourceUrl: cardMeta.sourceUrl,
        sourceMeta: cardMeta.sourceMeta,
        ownCheck: cardMeta.ownCheck,
        anchor: sourceAnchorSchema.parse(anchor),
      }),
    )
  }

  const paperNodes = findAllPaperNodes(repo)
  const documents: DocumentRecord[] = []
  for (const paper of paperNodes) {
    const docRecordCandidate =
      typeof paper.metadata === "object" &&
      paper.metadata !== null &&
      "documentRecord" in paper.metadata
        ? Reflect.get(paper.metadata, "documentRecord")
        : null
    if (docRecordCandidate) {
      const parsedDoc = documentRecordSchema.safeParse(docRecordCandidate)
      if (parsedDoc.success) {
        documents.push(
          documentRecordSchema.parse({
            ...parsedDoc.data,
            title: paper.title,
            overview: paper.body,
          }),
        )
      }
    }
  }

  const rawInsightRows = db.prepare("SELECT * FROM document_insights").all()
  const insights: DocumentInsight[] = rawInsightRows.map((raw) => {
    const row = insightRowSchema.parse(raw)
    return documentInsightSchema.parse({
      documentId: documentIdSchema.parse(row.document_id),
      kind: documentInsightKindSchema.parse(row.kind),
      value: row.value,
      updatedAt: row.updated_at,
    })
  })

  return workspaceSchema.parse({
    revision: settingsRow ? settingsRow.revision : 0,
    documents,
    cards,
    insights,
    sidebarOpen: Boolean(settingsRow ? settingsRow.sidebar_open : 1),
    outlineWidth: settingsRow ? settingsRow.outline_width : 240,
    researchSidebarWidth: settingsRow ? settingsRow.research_sidebar_width : 300,
    uiFontFamily: settingsRow ? settingsRow.ui_font_family : "wanted",
    uiFontScale: settingsRow ? settingsRow.ui_font_scale : 1,
    theme: settingsRow ? settingsRow.theme : "system",
    minimapVisible: Boolean(settingsRow ? settingsRow.minimap_visible : 1),
    viewport: {
      x: settingsRow ? settingsRow.viewport_x : 88,
      y: settingsRow ? settingsRow.viewport_y : 36,
      zoom: settingsRow ? settingsRow.viewport_zoom : 0.9,
    },
    activeDocumentId: settingsRow?.active_document_id
      ? documentIdSchema.parse(settingsRow.active_document_id)
      : null,
  })
}
