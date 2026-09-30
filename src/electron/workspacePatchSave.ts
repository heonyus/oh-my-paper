import type { AgentThread } from "../shared/agentChat"
import type { Sha256, Workspace } from "../shared/schemas"
import { WorkspaceConflictError } from "../shared/workspaceMerge"
import {
  applyWorkspacePatch,
  diffWorkspace,
  type WorkspacePatchRequest,
  type WorkspacePatchResult,
} from "../shared/workspacePatch"

/** What a patch save needs from the workspace store. */
export type WorkspacePatchStore = {
  /** The acknowledged snapshot the store still remembers for `token`. */
  readonly snapshot: (token: Sha256) => Workspace | undefined
  /** Agent threads as last written; acknowledged snapshots do not carry them. */
  readonly agentThreads: () => Promise<readonly AgentThread[]>
  /** The store's full three-way save. */
  readonly save: (workspace: Workspace) => Promise<Workspace>
}

/**
 * Rebuilds the renderer's workspace from the snapshot it last acknowledged, saves it through the
 * full three-way save with that snapshot as the base, and answers with how the committed workspace
 * differs from the rebuilt one. An unknown base or colliding edits are a conflict.
 */
export async function saveWorkspacePatch(
  store: WorkspacePatchStore,
  request: WorkspacePatchRequest,
): Promise<WorkspacePatchResult> {
  const snapshot = store.snapshot(request.baseSnapshotToken)
  if (!snapshot) return { status: "conflict" }
  try {
    const base: Workspace = { ...snapshot, agentThreads: [...(await store.agentThreads())] }
    const incoming = applyWorkspacePatch(base, request.patch)
    const acknowledged = await store.save({
      ...incoming,
      baseSnapshotToken: request.baseSnapshotToken,
    })
    if (!acknowledged.snapshotToken) throw new Error("Workspace snapshot token missing")
    return {
      status: "saved",
      snapshotToken: acknowledged.snapshotToken,
      revision: acknowledged.revision,
      patch: diffWorkspace(incoming, acknowledged),
    }
  } catch (error) {
    if (error instanceof WorkspaceConflictError) return { status: "conflict" }
    throw error
  }
}
