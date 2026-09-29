import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type AgentThread, agentThreadSchema } from "../shared/agentChat"
import { replaceFile } from "./fileReplace"

const AGENT_THREADS_MAX = 100

const agentThreadsFileSchema = z.object({
  threads: z.array(agentThreadSchema).max(AGENT_THREADS_MAX),
})

export function agentThreadsPath(root: string): string {
  return join(root, "agent-threads.json")
}

/** The threads exactly as `writeAgentThreads` would store them. */
export function normalizeAgentThreads(threads: readonly AgentThread[]): AgentThread[] {
  return agentThreadsFileSchema.parse({ threads: threads.slice(0, AGENT_THREADS_MAX) }).threads
}

export async function readAgentThreads(root: string): Promise<AgentThread[]> {
  try {
    const raw = await readFile(agentThreadsPath(root), "utf8")
    return agentThreadsFileSchema.parse(JSON.parse(raw)).threads
  } catch {
    return []
  }
}

export async function writeAgentThreads(
  root: string,
  threads: readonly AgentThread[],
): Promise<void> {
  const parsed = { threads: normalizeAgentThreads(threads) }
  await mkdir(root, { recursive: true })
  const target = agentThreadsPath(root)
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(parsed), { mode: 0o600 })
  await replaceFile(temporary, target)
}
