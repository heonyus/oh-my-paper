import { createHash } from "node:crypto"
import type { Sha256, Workspace } from "../shared/schemas"
import { sha256Schema } from "../shared/schemas"

const itemDigests = new WeakMap<object, string>()

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/** An item's digest, remembered per object: projected items are frozen and shared. */
function itemDigest(item: object): string {
  const known = itemDigests.get(item)
  if (known !== undefined) return known
  const digest = sha256Hex(JSON.stringify(item))
  if (Object.isFrozen(item)) itemDigests.set(item, digest)
  return digest
}

/**
 * A content address for the workspace, ignoring revision and tokens: the settings JSON plus the
 * digest of every list item, so an unchanged frozen item is not serialized again.
 */
export function workspaceSnapshotToken(workspace: Workspace): Sha256 {
  const {
    revision: _revision,
    baseRevision: _baseRevision,
    snapshotToken: _snapshotToken,
    baseSnapshotToken: _baseSnapshotToken,
    documents,
    cards,
    agentThreads,
    insights,
    readerNotes,
    ...settings
  } = workspace
  const hash = createHash("sha256").update(JSON.stringify(settings), "utf8")
  const lists = { documents, cards, agentThreads, insights, readerNotes }
  for (const [name, items] of Object.entries(lists)) {
    hash.update(`\n${name}:${items.length}`, "utf8")
    for (const item of items) hash.update(itemDigest(item), "utf8")
  }
  return sha256Schema.parse(hash.digest("hex"))
}

export function acknowledgedWorkspace(workspace: Workspace): Workspace {
  const {
    snapshotToken: _snapshotToken,
    baseSnapshotToken: _baseSnapshotToken,
    ...withoutTokens
  } = workspace
  return { ...withoutTokens, snapshotToken: workspaceSnapshotToken(workspace) }
}
