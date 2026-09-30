import type { AgentThread, AgentThreadMessage } from "../../shared/agentChat"
import type { DocumentId } from "../../shared/schemas"

export type ThreadGroupKey = "previous_7_days" | "previous_30_days" | "older"

/** The rail names each group from its key in the reader's language. */
export type ThreadGroup = {
  readonly key: ThreadGroupKey
  readonly threads: readonly AgentThread[]
}

const DAY_MS = 86_400_000

export function threadGroupKey(updatedAt: string, now: number): ThreadGroupKey {
  const updated = Date.parse(updatedAt)
  if (Number.isNaN(updated)) return "older"
  const age = now - updated
  if (age < 7 * DAY_MS) return "previous_7_days"
  if (age < 30 * DAY_MS) return "previous_30_days"
  return "older"
}

export function groupThreads(
  threads: readonly AgentThread[],
  now = Date.now(),
): readonly ThreadGroup[] {
  const groups: Record<ThreadGroupKey, AgentThread[]> = {
    previous_7_days: [],
    previous_30_days: [],
    older: [],
  }
  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  for (const thread of sorted) {
    groups[threadGroupKey(thread.updatedAt, now)].push(thread)
  }
  return (Object.keys(groups) as ThreadGroupKey[])
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, threads: groups[key] }))
}

export function createThread(
  id: string,
  title: string,
  contextDocIds: readonly DocumentId[],
  now = new Date().toISOString(),
): AgentThread {
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    contextDocIds: [...contextDocIds],
    messages: [],
  }
}

export function upsertThread(threads: readonly AgentThread[], thread: AgentThread): AgentThread[] {
  const index = threads.findIndex((existing) => existing.id === thread.id)
  if (index === -1) return [thread, ...threads]
  const next = [...threads]
  next[index] = thread
  return next
}

export function appendMessage(
  thread: AgentThread,
  message: AgentThreadMessage,
  now = new Date().toISOString(),
): AgentThread {
  const stamped: AgentThreadMessage = message.id ? message : { ...message, id: crypto.randomUUID() }
  return { ...thread, updatedAt: now, messages: [...thread.messages, stamped] }
}
