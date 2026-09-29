import type { Workspace } from "../shared/schemas"
import { WorkspaceConflictError } from "./knowledgeWorkspaceMerge"

const SNAPSHOTS_MAX = 8

/** The acknowledged workspaces a renderer may still name as the baseline of its next save. */
export class WorkspaceSnapshots {
  private readonly byToken = new Map<string, Workspace>()

  remember(workspace: Workspace): void {
    const token = workspace.snapshotToken
    if (!token) throw new Error("Workspace snapshot token missing")
    if (!this.byToken.has(token)) this.byToken.set(token, workspace)
    while (this.byToken.size > SNAPSHOTS_MAX) {
      const oldest = this.byToken.keys().next().value
      if (oldest === undefined) break
      this.byToken.delete(oldest)
    }
  }

  /**
   * The baseline `incoming` was edited from: the snapshot its token or revision names, or
   * `current` when it names none. A named snapshot that is gone is a conflict.
   */
  baseFor(incoming: Workspace, current: Workspace): Workspace {
    const baseToken = incoming.baseSnapshotToken ?? incoming.snapshotToken
    if (baseToken) {
      const base = this.byToken.get(baseToken)
      if (!base) throw new WorkspaceConflictError(`baseSnapshotToken:${baseToken}`)
      return base
    }
    const baseRevision = incoming.baseRevision ?? incoming.revision
    if (baseRevision === undefined) return current
    const matches = [...this.byToken.values()].filter(
      (snapshot) => snapshot.revision === baseRevision,
    )
    const [base] = matches
    if (!base || matches.length !== 1)
      throw new WorkspaceConflictError(`baseRevision:${baseRevision}`)
    return base
  }
}
