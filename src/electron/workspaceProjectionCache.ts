import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { AgentThread } from "../shared/agentChat"
import type { ReaderNote } from "../shared/readerNote"
import type { Workspace } from "../shared/schemas"
import type { KnowledgeRepository } from "./knowledgeRepository"
import { cachedStatement } from "./knowledgeStatements"
import { isRepositoryEmpty, WorkspaceProjector } from "./knowledgeWorkspaceProjection"
import { defaultWorkspace } from "./workspaceDefaults"
import { acknowledgedWorkspace } from "./workspaceSnapshot"

const ACKNOWLEDGED_MAX = 3
const changeRowSchema = z.object({ changes: z.number(), version: z.number() })

/** Moves whenever this connection writes (total_changes) or another one commits (data_version). */
function changeKeyOf(db: DatabaseSync): string {
  const row = cachedStatement(
    db,
    "SELECT total_changes() AS changes, data_version AS version FROM pragma_data_version()",
  ).get()
  const { changes, version } = changeRowSchema.parse(row)
  return `${changes}.${version}`
}

/** Freezes the workspace and its lists, which every cached copy shares. */
function frozen(workspace: Workspace): Workspace {
  Object.freeze(workspace.documents)
  Object.freeze(workspace.cards)
  Object.freeze(workspace.agentThreads)
  Object.freeze(workspace.insights)
  Object.freeze(workspace.readerNotes)
  return Object.freeze(workspace)
}

type Keyed = { readonly key: string; readonly workspace: Workspace }
type Acknowledged = {
  readonly base: Workspace
  readonly agentThreads: readonly AgentThread[]
  readonly readerNotes: readonly ReaderNote[]
  readonly workspace: Workspace
}

/**
 * The repository projection and the acknowledged workspaces built from it, recomputed only
 * after one of `databases` changed. The workspaces are shared and frozen; never mutate them.
 */
export class WorkspaceProjectionCache {
  private projected: Keyed | null = null
  private readBase: Keyed | null = null
  private acknowledged: readonly Acknowledged[] = []
  private readonly projector: WorkspaceProjector

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly databases: readonly DatabaseSync[],
  ) {
    this.projector = new WorkspaceProjector(repository)
  }

  private changeKey(): string {
    return this.databases.map(changeKeyOf).join(":")
  }

  /** The repository as a workspace; agent threads and reader notes are left empty. */
  current(): Workspace {
    if (this.projected?.key === this.changeKey()) return this.projected.workspace
    const workspace = frozen(this.projector.project())
    // Keyed after projecting, since the first projection creates the default board.
    this.projected = { key: this.changeKey(), workspace }
    return workspace
  }

  /** What `read` serves before its files: the defaults until anything is saved. */
  readable(): Workspace {
    if (this.readBase?.key === this.changeKey()) return this.readBase.workspace
    const workspace = isRepositoryEmpty(this.repository.db)
      ? frozen(defaultWorkspace())
      : this.current()
    this.readBase = { key: this.changeKey(), workspace }
    return workspace
  }

  /** `base` with these threads and notes and its snapshot token, hashed once per input. */
  acknowledge(
    base: Workspace,
    agentThreads: readonly AgentThread[],
    readerNotes: readonly ReaderNote[],
  ): Workspace {
    const known = this.acknowledged.find(
      (entry) =>
        entry.base === base &&
        entry.agentThreads === agentThreads &&
        entry.readerNotes === readerNotes,
    )
    if (known) return known.workspace
    const workspace = frozen(
      acknowledgedWorkspace({
        ...base,
        agentThreads: [...agentThreads],
        readerNotes: [...readerNotes],
      }),
    )
    const entry = { base, agentThreads, readerNotes, workspace }
    this.acknowledged = [entry, ...this.acknowledged].slice(0, ACKNOWLEDGED_MAX)
    return workspace
  }
}
