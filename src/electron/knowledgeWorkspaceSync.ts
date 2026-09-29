import type { DatabaseSync } from "node:sqlite"
import type { Workspace } from "../shared/schemas"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { workspaceSettingsRowSchema } from "./knowledgeRepositoryRows"
import { cachedStatement } from "./knowledgeStatements"
import { applyCards, applyDocuments, applyInsights } from "./knowledgeWorkspaceApply"
import { mergeWorkspaceForSave } from "./knowledgeWorkspaceMerge"
import { projectRepositoryToWorkspace } from "./knowledgeWorkspaceProjection"

/**
 * Writes `workspace`, merged over `baseWorkspace` when given, into the repository. Callers
 * that already projected the repository pass it as `currentWorkspace` to skip a projection.
 */
export function syncWorkspaceToRepository(
  repo: KnowledgeRepository,
  db: DatabaseSync,
  workspace: Workspace,
  baseWorkspace?: Workspace,
  transactionAlreadyOpen = false,
  currentWorkspace: Workspace = projectRepositoryToWorkspace(repo, db),
): void {
  const effectiveWorkspace = baseWorkspace
    ? mergeWorkspaceForSave(baseWorkspace, currentWorkspace, workspace)
    : workspace
  if (!transactionAlreadyOpen) db.exec("BEGIN IMMEDIATE")
  try {
    const now = new Date().toISOString()
    const rawSettings = cachedStatement(db, "SELECT * FROM workspace_settings WHERE id = 1").get()
    const currentSettings = rawSettings ? workspaceSettingsRowSchema.parse(rawSettings) : undefined
    const nextRevision = (currentSettings?.revision ?? 0) + 1

    cachedStatement(
      db,
      `INSERT INTO workspace_settings
       (id, sidebar_open, outline_width, research_sidebar_width, ui_font_family, ui_font_scale, theme, minimap_visible, viewport_x, viewport_y, viewport_zoom, active_document_id, revision, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         sidebar_open = excluded.sidebar_open,
         outline_width = excluded.outline_width,
         research_sidebar_width = excluded.research_sidebar_width,
         ui_font_family = excluded.ui_font_family,
         ui_font_scale = excluded.ui_font_scale,
         theme = excluded.theme,
         minimap_visible = excluded.minimap_visible,
         viewport_x = excluded.viewport_x,
         viewport_y = excluded.viewport_y,
         viewport_zoom = excluded.viewport_zoom,
         active_document_id = excluded.active_document_id,
         revision = excluded.revision,
         updated_at = excluded.updated_at`,
    ).run(
      effectiveWorkspace.sidebarOpen ? 1 : 0,
      effectiveWorkspace.outlineWidth,
      effectiveWorkspace.researchSidebarWidth,
      effectiveWorkspace.uiFontFamily,
      effectiveWorkspace.uiFontScale,
      effectiveWorkspace.theme,
      effectiveWorkspace.minimapVisible ? 1 : 0,
      effectiveWorkspace.viewport.x,
      effectiveWorkspace.viewport.y,
      effectiveWorkspace.viewport.zoom,
      effectiveWorkspace.activeDocumentId,
      nextRevision,
      now,
    )

    applyDocuments(repo, effectiveWorkspace.documents, currentWorkspace.documents, now)
    applyCards(repo, effectiveWorkspace.cards, currentWorkspace.cards)
    applyInsights(db, currentWorkspace.insights, effectiveWorkspace.insights)

    if (!transactionAlreadyOpen) db.exec("COMMIT")
  } catch (error) {
    if (!transactionAlreadyOpen) db.exec("ROLLBACK")
    throw error
  }
}
