import { stat } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import type { AgentThread } from "../shared/agentChat"
import type { ReaderNote } from "../shared/readerNote"
import {
  agentThreadsPath,
  normalizeAgentThreads,
  readAgentThreads,
  writeAgentThreads,
} from "./agentThreadsFile"
import { deepFrozen } from "./knowledgeRowMemo"
import { fileVersionOf, ReaderNotesCache } from "./readerNotesFiles"

/** The agent threads file's version; any stat failure reads as an empty thread list. */
async function threadsFileVersion(path: string): Promise<string> {
  try {
    return fileVersionOf(await stat(path))
  } catch (error) {
    return error instanceof Error && "code" in error ? `unreadable:${String(error.code)}` : "error"
  }
}

/**
 * Agent threads and reader notes as the workspace reads them, parsed again only after their
 * files change. Each array is returned as-is until then, so callers must not mutate it.
 */
export class WorkspaceFiles {
  private threads: { readonly version: string; readonly value: readonly AgentThread[] } | null =
    null
  private readonly notes: ReaderNotesCache

  constructor(private readonly root: string) {
    this.notes = new ReaderNotesCache(root)
  }

  async agentThreads(): Promise<readonly AgentThread[]> {
    const version = await threadsFileVersion(agentThreadsPath(this.root))
    if (this.threads?.version === version) return this.threads.value
    const value = deepFrozen(await readAgentThreads(this.root))
    this.threads = { version, value }
    return value
  }

  readerNotes(): Promise<readonly ReaderNote[]> {
    return this.notes.read()
  }

  /** Rewrites the agent threads file only when the stored threads would change. */
  async saveAgentThreads(threads: readonly AgentThread[]): Promise<void> {
    if (isDeepStrictEqual(await this.agentThreads(), normalizeAgentThreads(threads))) return
    await writeAgentThreads(this.root, threads)
  }
}
