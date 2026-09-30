import type { Workspace } from "../../shared/schemas"
import { mergeWorkspaceForSave, WorkspaceConflictError } from "../../shared/workspaceMerge"
import { acknowledgedFromPatch, diffWorkspace } from "../../shared/workspacePatch"

/** The full save the renderer has always made: every record, based on the workspace's own token. */
function saveInFull(next: Workspace): Promise<Workspace> {
  return window.ohmypaper.saveWorkspace({ ...next, baseSnapshotToken: next.snapshotToken })
}

/**
 * Recovers when the server cannot use the patch base (it restarted, forgot the snapshot, or the
 * edits collide): this renderer's edits since `baseline` are merged onto a fresh read, exactly as
 * the server would merge them, and saved in full on that read's snapshot.
 */
async function rebaseAndSave(baseline: Workspace, next: Workspace): Promise<Workspace> {
  const current = await window.ohmypaper.readWorkspace()
  return window.ohmypaper.saveWorkspace({
    ...mergeWorkspaceForSave(baseline, current, next),
    agentThreads: next.agentThreads,
    baseSnapshotToken: current.snapshotToken,
  })
}

/**
 * Saves `next` and returns the acknowledged workspace. While `next` still carries the token of
 * the acknowledged `baseline`, only the difference travels; a first save, a workspace replaced by
 * a fresh read, or a backend without patch saves sends the whole workspace as before.
 */
export async function saveWorkspaceChanges(
  baseline: Workspace | null,
  next: Workspace,
): Promise<Workspace> {
  const token = baseline?.snapshotToken
  const savePatch = window.ohmypaper.saveWorkspacePatch
  if (!baseline || !token || next.snapshotToken !== token || !savePatch) return saveInFull(next)
  const result = await savePatch({ baseSnapshotToken: token, patch: diffWorkspace(baseline, next) })
  switch (result.status) {
    case "saved":
      try {
        return acknowledgedFromPatch(next, result)
      } catch (error) {
        if (error instanceof WorkspaceConflictError) return rebaseAndSave(baseline, next)
        throw error
      }
    case "conflict":
      return rebaseAndSave(baseline, next)
    case "unsupported":
      return saveInFull(next)
  }
}
