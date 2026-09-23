import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type AgentThread, agentThreadSchema } from "../shared/agentChat"

const AGENT_THREADS_MAX = 100

const agentThreadsFileSchema = z.object({
  threads: z.array(agentThreadSchema).max(AGENT_THREADS_MAX),
})

function threadsPath(root: string): string {
  return join(root, "agent-threads.json")
}

export async function readAgentThreads(root: string): Promise<AgentThread[]> {
  try {
    const raw = await readFile(threadsPath(root), "utf8")
    return agentThreadsFileSchema.parse(JSON.parse(raw)).threads
  } catch {
    return []
  }
}

export async function writeAgentThreads(
  root: string,
  threads: readonly AgentThread[],
): Promise<void> {
  const bounded = threads.slice(0, AGENT_THREADS_MAX)
  const parsed = agentThreadsFileSchema.parse({ threads: bounded })
  await mkdir(root, { recursive: true })
  const target = threadsPath(root)
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(parsed), { mode: 0o600 })
  await rename(temporary, target)
}
