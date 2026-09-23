// @vitest-environment node

import { describe, expect, it } from "vitest"
import type { AgentThread } from "../../src/shared/agentChat"
import { workspaceSchema } from "../../src/shared/schemas"
import {
  appendMessage,
  createThread,
  groupThreads,
  threadGroupKey,
  upsertThread,
} from "../../src/web/research/agentThreadModel"

function thread(updatedAt: string, id = "t1"): AgentThread {
  return {
    id,
    title: `thread ${id}`,
    createdAt: updatedAt,
    updatedAt,
    contextDocIds: [],
    messages: [],
  }
}

describe("groupThreads", () => {
  it("buckets threads by recency and sorts newest first", () => {
    const now = Date.parse("2026-02-10T00:00:00Z")
    const threads = [
      thread("2026-01-05T00:00:00Z", "old"),
      thread("2026-02-09T00:00:00Z", "recent"),
      thread("2026-01-20T00:00:00Z", "month"),
    ]
    const groups = groupThreads(threads, now)
    expect(groups.map((group) => group.key)).toEqual([
      "previous_7_days",
      "previous_30_days",
      "older",
    ])
    expect(groups[0]?.threads[0]?.id).toBe("recent")
    expect(groups[1]?.threads[0]?.id).toBe("month")
    expect(groups[2]?.threads[0]?.id).toBe("old")
  })

  it("omits empty buckets and keeps recency order inside a bucket", () => {
    const now = Date.parse("2026-02-10T00:00:00Z")
    const groups = groupThreads(
      [thread("2026-02-08T00:00:00Z", "a"), thread("2026-02-09T00:00:00Z", "b")],
      now,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.threads.map((t) => t.id)).toEqual(["b", "a"])
  })

  it("treats unparseable dates as older", () => {
    expect(threadGroupKey("not-a-date", Date.now())).toBe("older")
  })
})

describe("thread helpers", () => {
  it("creates, appends and upserts threads", () => {
    const created = createThread("id-1", "제목", [], "2026-02-10T00:00:00Z")
    const withUser = appendMessage(
      created,
      { role: "user", content: "질문" },
      "2026-02-10T00:01:00Z",
    )
    expect(withUser.messages).toHaveLength(1)
    expect(withUser.updatedAt).toBe("2026-02-10T00:01:00Z")
    const stored = upsertThread([], withUser)
    expect(stored).toHaveLength(1)
    const updated = upsertThread(stored, { ...withUser, title: "바뀐 제목" })
    expect(updated).toHaveLength(1)
    expect(updated[0]?.title).toBe("바뀐 제목")
  })
})

describe("workspace persistence", () => {
  it("defaults agentThreads for workspaces saved before the feature", () => {
    const parsed = workspaceSchema.parse({
      documents: [],
      cards: [],
      sidebarOpen: true,
      viewport: { x: 0, y: 0, zoom: 1 },
      activeDocumentId: null,
    })
    expect(parsed.agentThreads).toEqual([])
  })
})
