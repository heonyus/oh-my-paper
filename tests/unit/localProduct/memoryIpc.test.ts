import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import type { MemorySourceRevisionReader } from "../../../src/electron/memoryIpcSourceValidation"
import {
  initializeMemoryRepository,
  type MemoryRepository,
} from "../../../src/electron/memoryRepository"
import { createMemoryPreloadApi, type MemoryIpcRenderer } from "../../../src/electron/preloadMemory"
import { type MemoryIpcMain, registerMemoryIpc } from "../../../src/electron/registerMemoryIpc"
import {
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
  knowledgeNodeIdSchema,
} from "../../../src/shared/knowledgeSchemas"
import {
  type MemoryScope,
  memoryDerivationKeySchema,
  memoryDraftSchema,
} from "../../../src/shared/memorySchemas"

type Handler = (event: unknown, payload: unknown) => Promise<unknown>

class FakeIpcMain implements MemoryIpcMain, MemoryIpcRenderer {
  private readonly handlers = new Map<string, Handler>()

  readonly handle = (channel: string, listener: Handler): void => {
    this.handlers.set(channel, listener)
  }

  readonly removeHandler = (channel: string): void => {
    this.handlers.delete(channel)
  }

  readonly invoke = async (channel: string, payload: unknown): Promise<unknown> => {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler ${channel}`)
    return handler({}, payload)
  }
}

const scope: MemoryScope = { kind: "collection", key: "collection-test" }
const otherScope: MemoryScope = { kind: "project", key: "project-test" }
const nodeId = knowledgeNodeIdSchema.parse("11111111-1111-4111-8111-111111111111")
const anchorId = evidenceAnchorIdSchema.parse("22222222-2222-4222-8222-222222222222")
const documentVersionId = documentVersionIdSchema.parse("33333333-3333-4333-8333-333333333333")

function clock(): string {
  return "2026-09-06T00:00:00.000Z"
}

function sourceReader(revision: { value: string }): MemorySourceRevisionReader {
  return {
    readNodeRevision: (id) => (id === nodeId ? revision.value : null),
    readPdfEvidence: (anchor, version) =>
      anchor === anchorId && version === documentVersionId
        ? { sourceRevision: "a".repeat(64), quote: "actual local quote", page: 4 }
        : null,
  }
}

function setup(
  target: DatabaseSync | MemoryRepository,
  reader?: MemorySourceRevisionReader,
): Readonly<{
  readonly api: ReturnType<typeof createMemoryPreloadApi>
  readonly host: FakeIpcMain
}> {
  const host = new FakeIpcMain()
  const options = reader
    ? { collectionScope: scope, sourceRevisionReader: reader }
    : { collectionScope: scope }
  registerMemoryIpc(host, target, options)
  return { api: createMemoryPreloadApi(host, scope), host }
}

describe("memory IPC adapters", () => {
  it("keeps explicit user memory review and forgetting scoped through IPC", async () => {
    const db = new DatabaseSync(":memory:")
    const repository = initializeMemoryRepository(db, clock)
    repository.propose({
      derivationKey: memoryDerivationKeySchema.parse("other-scope"),
      text: "다른 범위 기억",
      scope: otherScope,
      evidence: [],
      revision: 1,
      origin: { kind: "user", modelVersion: null },
    })
    const { api } = setup(repository)

    const proposal = await api.propose({
      derivationKey: "decision:local-only",
      text: "로컬 근거를 직접 확인합니다.",
      revision: 1,
    })
    expect(proposal.kind).toBe("created")
    const pending = await api.list()
    expect(pending.records).toHaveLength(1)
    expect(pending.records[0]?.state).toBe("pending")

    if (proposal.kind !== "created") throw new Error("Expected created proposal")
    await api.approve(proposal.record.id)
    expect((await api.retrieve({ terms: ["로컬"] })).records).toHaveLength(1)
    await api.forget(proposal.record.id)
    expect((await api.retrieve({ terms: ["로컬"] })).records).toHaveLength(0)
    expect(
      (
        await api.propose({
          derivationKey: "decision:local-only",
          text: "로컬 근거를 직접 확인합니다.",
          revision: 2,
        })
      ).kind,
    ).toBe("suppressed")
  })

  it("rejects stale source approval and stores only main-validated evidence", async () => {
    const db = new DatabaseSync(":memory:")
    const repository = initializeMemoryRepository(db, clock)
    const revision = { value: "b".repeat(64) }
    const { api } = setup(repository, sourceReader(revision))
    const proposal = await api.propose({
      derivationKey: "source:decision",
      text: "이 선택은 확인한 출처에 의존합니다.",
      revision: 1,
      sourceEvidence: [
        { kind: "node", nodeId, sourceRevision: revision.value },
        {
          kind: "pdf-fragment",
          evidenceAnchorId: anchorId,
          documentVersionId,
          sourceRevision: "a".repeat(64),
        },
      ],
    })
    if (proposal.kind !== "created") throw new Error("Expected created proposal")
    expect(proposal.record.evidence[1]?.quote).toBe("actual local quote")
    revision.value = "c".repeat(64)

    await expect(api.approve(proposal.record.id)).rejects.toMatchObject({
      code: "stale_source",
    })
    expect((await api.list()).records[0]?.state).toBe("pending")
  })

  it("invalidates accepted source memory at read time without a collection event", async () => {
    const db = new DatabaseSync(":memory:")
    const repository = initializeMemoryRepository(db, clock)
    const revision = { value: "b".repeat(64) }
    const { api } = setup(repository, sourceReader(revision))
    const proposal = await api.propose({
      derivationKey: "source:read-boundary",
      text: "이 기억은 현재 노트에 의존합니다.",
      revision: 1,
      sourceEvidence: [{ kind: "node", nodeId, sourceRevision: revision.value }],
    })
    if (proposal.kind !== "created") throw new Error("Expected created proposal")
    await api.approve(proposal.record.id)

    revision.value = "c".repeat(64)

    expect((await api.retrieve()).records).toHaveLength(0)
    expect((await api.list()).records[0]?.state).toBe("invalidated")
  })

  it("accepts a database target and exposes invalidation and export hooks", async () => {
    const db = new DatabaseSync(":memory:")
    const { api } = setup(db)
    const proposal = await api.propose({
      derivationKey: "source:plain",
      text: "출처가 변경되면 제외됩니다.",
      revision: 1,
    })
    if (proposal.kind !== "created") throw new Error("Expected created proposal")
    await api.approve(proposal.record.id)
    const invalidated = await api.invalidate({
      sourceKey: "note:local",
      currentRevision: "rev-2",
    })
    expect(invalidated).toBe(0)
    expect((await api.export()).page.records).toHaveLength(1)
  })

  it("resolves the registered active scope when preload receives no test override", async () => {
    const db = new DatabaseSync(":memory:")
    const { host } = setup(db)
    const api = createMemoryPreloadApi(host)

    expect(await api.getScope()).toEqual(scope)
    expect((await api.list()).records).toHaveLength(0)
  })

  it("bounds scoped freshness work to the requested page in a large corpus", async () => {
    const db = new DatabaseSync(":memory:")
    let now = 0
    const repository = initializeMemoryRepository(db, () =>
      new Date(1_788_000_000_000 + now++).toISOString(),
    )
    for (const recordScope of [scope, otherScope]) {
      for (let index = 0; index < 80; index += 1) {
        repository.createApproved(
          memoryDraftSchema.parse({
            derivationKey: memoryDerivationKeySchema.parse(`large:${recordScope.kind}:${index}`),
            text: `Large synthetic memory ${recordScope.kind} ${index}`,
            scope: recordScope,
            evidence: [
              {
                kind: "knowledge-record",
                sourceKey: `node:${nodeId}`,
                sourceRevision: "b".repeat(64),
                quote: null,
                page: null,
              },
            ],
            revision: 1,
            origin: { kind: "user", modelVersion: null },
          }),
        )
      }
    }

    let sourceReads = 0
    const reader: MemorySourceRevisionReader = {
      readNodeRevision: () => {
        sourceReads += 1
        return "b".repeat(64)
      },
      readPdfEvidence: () => null,
    }
    const { api } = setup(repository, reader)

    const page = await api.list({ page: 0, pageSize: 5 })

    expect(page.records).toHaveLength(5)
    expect(page.records.every((record) => record.scope.key === scope.key)).toBe(true)
    expect(sourceReads).toBeLessThanOrEqual(6)

    sourceReads = 0
    expect((await api.retrieve()).records).toHaveLength(8)
    expect(sourceReads).toBeLessThanOrEqual(64)
  })

  it("does not refill accepted pages or retrieval candidates with unchecked stale tails", async () => {
    const listDb = new DatabaseSync(":memory:")
    let listNow = 0
    const listRepository = initializeMemoryRepository(listDb, () =>
      new Date(1_788_000_000_000 + listNow++).toISOString(),
    )
    for (let index = 0; index < 4; index += 1) {
      const node = knowledgeNodeIdSchema.parse(
        `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      )
      listRepository.createApproved(
        memoryDraftSchema.parse({
          derivationKey: memoryDerivationKeySchema.parse(`boundary:list:${index}`),
          text: `Stale list boundary ${index}`,
          scope,
          evidence: [
            {
              kind: "knowledge-record",
              sourceKey: `node:${node}`,
              sourceRevision: "old",
              quote: null,
              page: null,
            },
          ],
          revision: 1,
          origin: { kind: "user", modelVersion: null },
        }),
      )
    }
    const listValidated = new Set<string>()
    const listReader: MemorySourceRevisionReader = {
      readNodeRevision: (node) => {
        listValidated.add(`node:${node}`)
        return "new"
      },
      readPdfEvidence: () => null,
    }
    const { api: listApi } = setup(listRepository, listReader)

    const retrievalDb = new DatabaseSync(":memory:")
    let retrievalNow = 0
    const retrievalRepository = initializeMemoryRepository(retrievalDb, () =>
      new Date(1_788_000_000_000 + retrievalNow++).toISOString(),
    )
    for (let index = 0; index < 65; index += 1) {
      const node = knowledgeNodeIdSchema.parse(
        `00000000-0000-4000-8000-${(index + 10).toString(16).padStart(12, "0")}`,
      )
      retrievalRepository.createApproved(
        memoryDraftSchema.parse({
          derivationKey: memoryDerivationKeySchema.parse(`boundary:retrieve:${index}`),
          text: `Stale retrieval boundary ${index}`,
          scope,
          evidence: [
            {
              kind: "knowledge-record",
              sourceKey: `node:${node}`,
              sourceRevision: "old",
              quote: null,
              page: null,
            },
          ],
          revision: 1,
          origin: { kind: "user", modelVersion: null },
        }),
      )
    }
    const retrievalValidated = new Set<string>()
    const retrievalReader: MemorySourceRevisionReader = {
      readNodeRevision: (node) => {
        retrievalValidated.add(`node:${node}`)
        return "new"
      },
      readPdfEvidence: () => null,
    }
    const { api: retrievalApi } = setup(retrievalRepository, retrievalReader)

    const listPage = await listApi.list({ page: 0, pageSize: 2, state: "accepted" })
    const retrieval = await retrievalApi.retrieve()

    expect({
      listCount: listPage.records.length,
      listReturnedUnchecked: listPage.records.some((record) =>
        record.evidence.some((evidence) => !listValidated.has(evidence.sourceKey)),
      ),
      listHasNextPage: listPage.hasNextPage,
      retrievalCount: retrieval.records.length,
      retrievalReturnedUnchecked: retrieval.records.some((record) =>
        record.evidence.some((evidence) => !retrievalValidated.has(evidence.sourceKey)),
      ),
    }).toEqual({
      listCount: 0,
      listReturnedUnchecked: false,
      listHasNextPage: true,
      retrievalCount: 0,
      retrievalReturnedUnchecked: false,
    })
  })
})
