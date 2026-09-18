import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import {
  initializeMemoryRepository,
  type MemoryRepository,
} from "../../../src/electron/memoryRepository"
import {
  type MemoryDraft,
  memoryDraftSchema,
  memoryRetrievalQuerySchema,
} from "../../../src/shared/memorySchemas"

const databases: DatabaseSync[] = []
let clockTick = 0

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

function repository(): MemoryRepository {
  const db = new DatabaseSync(":memory:")
  databases.push(db)
  return initializeMemoryRepository(db, () =>
    new Date(1_788_000_000_000 + clockTick++).toISOString(),
  )
}

function draft(
  options: {
    readonly derivationKey?: string
    readonly text?: string
    readonly conservativeTokenEstimate?: number
    readonly sourceRevision?: string
  } = {},
): MemoryDraft {
  return memoryDraftSchema.parse({
    derivationKey: options.derivationKey ?? `decision-${clockTick}`,
    text: options.text ?? "The reviewed decision is local and source-grounded.",
    conservativeTokenEstimate: options.conservativeTokenEstimate ?? 24,
    scope: { kind: "collection", key: "collection-test" },
    evidence: [
      {
        kind: "note",
        sourceKey: "note:test",
        sourceRevision: options.sourceRevision ?? "rev-1",
        quote: "The reviewed decision is local and source-grounded.",
        page: null,
      },
    ],
    revision: 1,
    origin: { kind: "user", modelVersion: null },
  })
}

const query = () =>
  memoryRetrievalQuerySchema.parse({
    scope: { kind: "collection", key: "collection-test" },
    terms: [],
  })

describe("semantic memory lifecycle", () => {
  it("keeps proposals pending and retrieves only after explicit approval", () => {
    const repo = repository()
    const proposed = repo.propose(draft())
    expect(proposed.kind).toBe("created")
    if (proposed.kind !== "created") throw new Error("proposal was unexpectedly suppressed")

    expect(repo.retrieve(query()).records).toHaveLength(0)
    const accepted = repo.approve(proposed.record.id)
    expect(accepted.state).toBe("accepted")
    expect(repo.retrieve(query()).records.map((record) => record.id)).toEqual([accepted.id])
  })

  it("invalidates source-derived memory without erasing its record", () => {
    const repo = repository()
    const created = repo.createApproved(draft())
    if (created.kind !== "created") throw new Error("approved record was not created")

    expect(repo.invalidateSource("note:test", "rev-2")).toBe(1)
    expect(repo.get(created.record.id)?.state).toBe("invalidated")
    expect(repo.retrieve(query()).records).toHaveLength(0)
    expect(repo.list({ state: "invalidated" }).records).toHaveLength(1)
  })

  it("tombstones forgotten derivations while explicit approval can create a new record", () => {
    const repo = repository()
    const original = repo.createApproved(draft({ derivationKey: "forget-me" }))
    if (original.kind !== "created") throw new Error("approved record was not created")
    repo.forget(original.record.id)

    const suppressed = repo.propose(draft({ derivationKey: "forget-me" }))
    expect(suppressed.kind).toBe("suppressed")
    const recreated = repo.createApproved(draft({ derivationKey: "forget-me" }))
    expect(recreated.kind).toBe("created")
    if (recreated.kind !== "created") throw new Error("explicit recreation was blocked")
    expect(recreated.record.id).not.toBe(original.record.id)
    expect(repo.retrieve(query()).records).toEqual([recreated.record])
  })

  it("keeps retrieval within eight entries and a 1,000-token conservative bound", () => {
    const repo = repository()
    for (let index = 0; index < 10; index += 1) {
      repo.createApproved(
        draft({
          derivationKey: `bounded-${index}`,
          text: `Bounded memory ${index}`,
          conservativeTokenEstimate: 120,
        }),
      )
    }

    const result = repo.retrieve(query())
    expect(result.records).toHaveLength(8)
    expect(result.conservativeTokenCount).toBe(960)
    expect(result.conservativeTokenCount).toBeLessThanOrEqual(1_000)
    expect(result.omittedCount).toBe(2)
  })
})

describe("factual navigation recents", () => {
  it("keeps the latest 100 recents separately from semantic retention", () => {
    const repo = repository()
    const oldMemory = repo.createApproved(
      draft({ derivationKey: "old-memory", sourceRevision: "old-revision" }),
    )
    if (oldMemory.kind !== "created") throw new Error("old memory was not created")

    for (let index = 0; index < 105; index += 1) {
      repo.recordNavigation({
        scope: { kind: "collection", key: "collection-test" },
        kind: "opened_page",
        fact: `fact-${index}`,
        sourceKey: `document:test:${index}`,
        sourceRevision: `rev-${index}`,
        occurredAt: new Date(1_788_100_000_000 + index).toISOString(),
      })
    }

    const recents = repo.listNavigationRecents({ kind: "collection", key: "collection-test" })
    expect(recents).toHaveLength(100)
    expect(recents[0]?.fact).toBe("fact-104")
    expect(recents[99]?.fact).toBe("fact-5")
    expect(repo.get(oldMemory.record.id)?.state).toBe("accepted")
    expect(repo.list({ state: "accepted" }).records).toHaveLength(1)
  })
})

describe("local memory boundary", () => {
  it.each(["https://example.test/paper", "wiki:unrelated-history"])(
    "rejects non-local source %s",
    (sourceKey) => {
      expect(
        memoryDraftSchema.safeParse({
          ...draft(),
          evidence: [
            {
              kind: "note",
              sourceKey,
              sourceRevision: "rev-1",
              quote: null,
              page: null,
            },
          ],
        }).success,
      ).toBe(false)
    },
  )
})
