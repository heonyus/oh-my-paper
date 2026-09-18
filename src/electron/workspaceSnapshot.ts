import { createHash } from "node:crypto"
import type { Sha256, Workspace } from "../shared/schemas"
import { sha256Schema } from "../shared/schemas"

export function workspaceSnapshotToken(workspace: Workspace): Sha256 {
  const {
    revision: _revision,
    baseRevision: _baseRevision,
    snapshotToken: _snapshotToken,
    baseSnapshotToken: _baseSnapshotToken,
    ...content
  } = workspace
  return sha256Schema.parse(
    createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex"),
  )
}

export function acknowledgedWorkspace(workspace: Workspace): Workspace {
  const {
    snapshotToken: _snapshotToken,
    baseSnapshotToken: _baseSnapshotToken,
    ...withoutTokens
  } = workspace
  return { ...withoutTokens, snapshotToken: workspaceSnapshotToken(workspace) }
}
