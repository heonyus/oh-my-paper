import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { BoardCard, DocumentInsight, DocumentRecord, Workspace } from "../shared/schemas"
import {
  boardCardSchema,
  documentIdSchema,
  documentInsightSchema,
  sourceAnchorSchema,
  workspaceSchema,
} from "../shared/schemas"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { insightRowSchema, workspaceSettingsRowSchema } from "./knowledgeRepositoryRows"
import { deepFrozen, RowMemo, rowKey, type SqlRow } from "./knowledgeRowMemo"
import { cachedStatement } from "./knowledgeStatements"
import { readLibraryDocuments } from "./workspaceDocuments"

const cardMetaSchema = boardCardSchema
  .pick({
    chat: true,
    loading: true,
    sourceKey: true,
    sourceUrl: true,
    sourceMeta: true,
  })
  .partial()
  .extend({
    documentId: documentIdSchema.optional(),
    cardKind: boardCardSchema.shape.kind.optional(),
    anchor: sourceAnchorSchema.optional(),
  })

const cardPlacementRowSchema = z.object({
  placement_id: z.string(),
  placement_card_id: z.string().nullable(),
  placement_x: z.number(),
  placement_y: z.number(),
  placement_width: z.number(),
  placement_height: z.number().nullable(),
  placement_minimized: z.number(),
})

const projectedSettingsSchema = workspaceSchema.pick({
  revision: true,
  sidebarOpen: true,
  outlineWidth: true,
  researchSidebarWidth: true,
  uiFontFamily: true,
  uiFontScale: true,
  theme: true,
  minimapVisible: true,
  viewport: true,
  activeDocumentId: true,
})

const emptyRowSchema = z.object({ empty: z.number() })

/** True before anything was saved: no settings row and no knowledge node. */
export function isRepositoryEmpty(db: DatabaseSync): boolean {
  const row = cachedStatement(
    db,
    `SELECT NOT EXISTS (SELECT 1 FROM workspace_settings)
       AND NOT EXISTS (SELECT 1 FROM knowledge_nodes) AS empty`,
  ).get()
  return emptyRowSchema.parse(row).empty === 1
}

/** The card a placement row joined to its node describes, or null without document and anchor. */
function cardOfRow(repo: KnowledgeRepository, row: SqlRow): BoardCard | null {
  const node = repo.nodeFromRow(row)
  const cardMetaParsed = cardMetaSchema.safeParse(node.metadata)
  const cardMeta = cardMetaParsed.success ? cardMetaParsed.data : {}
  if (!cardMeta.documentId || !cardMeta.anchor) return null
  const placement = cardPlacementRowSchema.parse(row)
  return boardCardSchema.parse({
    id: placement.placement_card_id ?? placement.placement_id,
    documentId: cardMeta.documentId,
    kind: cardMeta.cardKind ?? "note",
    title: node.title,
    body: node.body,
    x: placement.placement_x,
    y: placement.placement_y,
    minimized: Boolean(placement.placement_minimized),
    width: placement.placement_width,
    height: placement.placement_height,
    loading: Boolean(cardMeta.loading),
    chat: cardMeta.chat ?? [],
    sourceKey: cardMeta.sourceKey,
    sourceUrl: cardMeta.sourceUrl,
    sourceMeta: cardMeta.sourceMeta,
    anchor: cardMeta.anchor,
  })
}

/** The default board's cards in placement order, each placement joined to its node in one query. */
function projectBoardCards(
  repo: KnowledgeRepository,
  db: DatabaseSync,
  memo: RowMemo<BoardCard | null> | undefined,
): BoardCard[] {
  const board = repo.getOrCreateDefaultBoard()
  const rows = cachedStatement(
    db,
    `SELECT n.*, p.id AS placement_id, p.card_id AS placement_card_id, p.x AS placement_x,
       p.y AS placement_y, p.width AS placement_width, p.height AS placement_height,
       p.minimized AS placement_minimized
     FROM placements p JOIN knowledge_nodes n ON n.id = p.node_id
     WHERE p.board_id = ?
     ORDER BY p.z_index ASC, p.rowid ASC`,
  ).all(board.id)
  const cards = memo
    ? memo.map(
        rows,
        (row) => rowKey(row, "placement_id"),
        (row) => deepFrozen(cardOfRow(repo, row)),
        // A collection note's body comes from its file index, outside the row.
        (row) => repo.canonicalNoteBody(rowKey(row, "id"), rowKey(row, "kind")),
      )
    : rows.map((row) => cardOfRow(repo, row))
  return cards.flatMap((card) => (card ? [card] : []))
}

function projectInsights(db: DatabaseSync): DocumentInsight[] {
  return cachedStatement(db, "SELECT * FROM document_insights")
    .all()
    .map((raw) => {
      const row = insightRowSchema.parse(raw)
      return documentInsightSchema.parse({
        documentId: row.document_id,
        kind: row.kind,
        value: row.value,
        updatedAt: row.updated_at,
      })
    })
}

type ProjectionMemos = {
  readonly cards: RowMemo<BoardCard | null>
  readonly documents: RowMemo<DocumentRecord | null>
}

function projectWorkspace(
  repo: KnowledgeRepository,
  db: DatabaseSync,
  memos: ProjectionMemos | undefined,
): Workspace {
  const rawSettings = cachedStatement(db, "SELECT * FROM workspace_settings WHERE id = 1").get()
  const settingsRow = rawSettings ? workspaceSettingsRowSchema.parse(rawSettings) : undefined
  const cards = projectBoardCards(repo, db, memos?.cards)
  const documents = readLibraryDocuments(db, memos?.documents)
  const insights = projectInsights(db)
  const settings = projectedSettingsSchema.parse({
    revision: settingsRow ? settingsRow.revision : 0,
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
    activeDocumentId: settingsRow?.active_document_id ? settingsRow.active_document_id : null,
  })
  return {
    revision: settings.revision ?? 0,
    documents: [...documents],
    cards,
    agentThreads: [],
    insights,
    readerNotes: [],
    sidebarOpen: settings.sidebarOpen,
    outlineWidth: settings.outlineWidth,
    researchSidebarWidth: settings.researchSidebarWidth,
    uiFontFamily: settings.uiFontFamily,
    uiFontScale: settings.uiFontScale,
    theme: settings.theme,
    minimapVisible: settings.minimapVisible,
    viewport: settings.viewport,
    activeDocumentId: settings.activeDocumentId,
  }
}

/** The workspace the repository describes; agent threads and reader notes live in files. */
export function projectRepositoryToWorkspace(
  repo: KnowledgeRepository,
  db: DatabaseSync,
): Workspace {
  return projectWorkspace(repo, db, undefined)
}

/**
 * Projects the same repository repeatedly, reusing the frozen card and document objects of
 * rows that did not change since its previous projection.
 */
export class WorkspaceProjector {
  private readonly memos: ProjectionMemos = { cards: new RowMemo(), documents: new RowMemo() }

  constructor(private readonly repo: KnowledgeRepository) {}

  project(): Workspace {
    return projectWorkspace(this.repo, this.repo.db, this.memos)
  }
}
