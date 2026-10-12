import type { Workspace } from "../../shared/schemas"
import {
  isWorkspaceConflictError,
  resolveWorkspaceConflicts,
  WorkspaceConflictError,
} from "../../shared/workspaceMerge"
import { acknowledgedFromPatch, diffWorkspace } from "../../shared/workspacePatch"

/** The full save the renderer has always made: every record, based on the workspace's own token. */
function saveInFull(next: Workspace): Promise<Workspace> {
  return window.ohmypaper.saveWorkspace({ ...next, baseSnapshotToken: next.snapshotToken })
}

/**
 * Recovers when the server cannot use the save's base (it restarted and forgot the snapshot, or
 * the edits collide): this renderer's edits since `baseline` are merged onto a fresh read and
 * saved in full on that read's snapshot. A field both sides changed keeps this renderer's value;
 * refusing it again would leave the save failing forever, with the reader's edits never written.
 * Without a baseline the fresh read stands in for it, so the save carries what is on screen.
 */
async function rebaseAndSave(baseline: Workspace | null, next: Workspace): Promise<Workspace> {
  const current = await window.ohmypaper.readWorkspace()
  return window.ohmypaper.saveWorkspace({
    ...resolveWorkspaceConflicts(baseline ?? current, current, next),
    agentThreads: next.agentThreads,
    baseSnapshotToken: current.snapshotToken,
  })
}

/**
 * Saves `next` and returns the acknowledged workspace. While `next` still carries the token of
 * the acknowledged `baseline`, only the difference travels; a first save, a workspace replaced by
 * a fresh read, or a backend without patch saves sends the whole workspace as before. A save the
 * backend refuses as a conflict is rebased onto its current workspace instead of failing.
 */
export async function saveWorkspaceChanges(
  baseline: Workspace | null,
  next: Workspace,
): Promise<Workspace> {
  const token = baseline?.snapshotToken
  const savePatch = window.ohmypaper.saveWorkspacePatch
  if (!baseline || !token || next.snapshotToken !== token || !savePatch) {
    try {
      return await saveInFull(next)
    } catch (error) {
      if (isWorkspaceConflictError(error)) return rebaseAndSave(baseline, next)
      throw error
    }
  }
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
