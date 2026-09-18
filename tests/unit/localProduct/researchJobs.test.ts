// @vitest-environment node
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ResearchRuntime } from "../../../src/electron/researchJobRuntime"
import { ResearchJobStore } from "../../../src/electron/researchJobStore"
import { ResearchJobs } from "../../../src/electron/researchJobs"
import { researchDraftNotice } from "../../../src/electron/researchReport"
import { WebDiscoveryError } from "../../../src/electron/webDiscovery"
import { knowledgeNodeIdSchema } from "../../../src/shared/knowledgeSchemas"
import {
  type ResearchPreviewInput,
  researchJobSnapshotSchema,
} from "../../../src/shared/researchJobSchemas"
import {
  researchSourceIdSchema,
  researchSourceSchema,
  webDiscoveryResultSchema,
} from "../../../src/shared/researchSourceSchemas"

const databases: DatabaseSync[] = []
const jobId = "123e4567-e89b-42d3-a456-426614174010"
const sourceId = researchSourceIdSchema.parse("123e4567-e89b-42d3-a456-426614174011")
const noteId = knowledgeNodeIdSchema.parse("123e4567-e89b-42d3-a456-426614174012")
const candidate = webDiscoveryResultSchema.parse({
  sourceId,
  title: "Official source",
  url: "https://example.org/article",
  snippet: "Search metadata",
  kind: "landing_page",
})
const fetched = researchSourceSchema.parse({
  id: sourceId,
  title: candidate.title,
  url: candidate.url,
  finalUrl: candidate.url,
  page: null,
  snippet: "Validated passage",
  access: "html_excerpt",
  origin: "web",
  contentType: "text/html",
  byteLength: 17,
  contentHash: "a".repeat(64),
  content: "Validated passage",
  fetchedAt: "2026-09-06T00:00:01.000Z",
})

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

function store(): ResearchJobStore {
  const db = new DatabaseSync(":memory:")
  databases.push(db)
  return new ResearchJobStore(
    db,
    () => "2026-09-06T00:00:00.000Z",
    () => jobId,
  )
}

function input(): ResearchPreviewInput {
  return {
    question: "What does the evidence support?",
    provider: "codex_subscription",
    scope: { external: true, localSourceIds: [] },
    budgets: { searchRounds: 1, sources: 2, minutes: 15, modelTurns: 1 },
  }
}

describe("bounded research jobs", () => {
  it("does no source or model work before explicit start and counts before calls", async () => {
    // Given
    const repository = store()
    const search = vi.fn<ResearchRuntime["search"]>()
    search.mockImplementation(async () => {
      const running = repository.require(researchJobSnapshotSchema.parse(preview).id)
      expect(running.counts.searchRounds).toBe(1)
      expect(running.requests.at(-1)?.state).toBe("pending")
      return { providerRequestId: "search-1", results: [candidate] }
    })
    const fetchSource = vi.fn<ResearchRuntime["fetchSource"]>(async () => {
      const running = repository.require(researchJobSnapshotSchema.parse(preview).id)
      expect(running.counts.sourcesAttempted).toBe(1)
      return fetched
    })
    const runModel = vi.fn<ResearchRuntime["runModel"]>(async ({ allowedEvidenceIds }) => {
      const running = repository.require(researchJobSnapshotSchema.parse(preview).id)
      expect(running.counts.modelTurns).toBe(1)
      expect(allowedEvidenceIds).toEqual([sourceId])
      return {
        decision: {
          kind: "report",
          title: "Evidence report",
          markdown: "The validated passage supports the bounded claim.",
          sourceIds: [sourceId],
        },
        inputTokens: null,
        outputTokens: null,
      }
    })
    const createNode = vi.fn(async () => ({ id: noteId }))
    const jobs = new ResearchJobs(
      repository,
      {
        search,
        fetchSource,
        readLocalSource: async () => fetched,
        runModel,
      },
      createNode,
    )

    // When
    const preview = jobs.preview(input())

    // Then
    expect(search).not.toHaveBeenCalled()
    expect(fetchSource).not.toHaveBeenCalled()
    expect(runModel).not.toHaveBeenCalled()
    expect(createNode).not.toHaveBeenCalled()

    jobs.start(preview.id)
    const completed = await jobs.wait(preview.id)
    expect(completed.status).toBe("completed")
    expect(completed.counts).toEqual({
      searchRounds: 1,
      sourcesAttempted: 1,
      sourcesRetrieved: 1,
      modelTurns: 1,
    })
    expect(completed.providerUsage).toEqual({ state: "unknown" })
    expect(completed.requests.find(({ kind }) => kind === "search")?.providerRequestId).toBe(
      "search-1",
    )
    expect(completed.report?.markdown).toContain("https://example.org/article")
    expect(createNode).not.toHaveBeenCalled()

    const saved = await jobs.saveReport({
      jobId: preview.id,
      title: "Edited evidence report",
      markdown: "User-edited canonical report.",
    })
    expect(saved.reportNodeId).toBe(noteId)
    expect(createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Edited evidence report",
        body: `${researchDraftNotice}\n\nUser-edited canonical report.`,
        metadata: {
          research: {
            jobId: preview.id,
            state: "draft",
            citations: [
              {
                sourceId,
                expectedContentHash: fetched.contentHash,
                url: fetched.finalUrl,
                page: fetched.page,
                snippet: fetched.snippet,
                accessLabel: "full-text excerpt",
              },
            ],
          },
        },
      }),
    )
  })

  it("pauses an interrupted pending request and never resumes without a user call", () => {
    // Given
    const db = new DatabaseSync(":memory:")
    databases.push(db)
    const first = new ResearchJobStore(
      db,
      () => "2026-09-06T00:00:00.000Z",
      () => jobId,
    )
    const preview = first.create(input())
    first.save(
      researchJobSnapshotSchema.parse({
        ...preview,
        status: "running",
        phase: "searching",
        activeSince: "2026-09-06T00:00:00.000Z",
        requests: [
          {
            id: "123e4567-e89b-42d3-a456-426614174013",
            kind: "search",
            state: "pending",
            providerRequestId: null,
            startedAt: "2026-09-06T00:00:00.000Z",
            completedAt: null,
          },
        ],
      }),
    )

    // When
    const reopened = new ResearchJobStore(db, () => "2026-09-06T00:00:02.000Z")
    const recovered = reopened.require(preview.id)

    // Then
    expect(recovered.status).toBe("paused")
    expect(recovered.pauseReason).toBe("restart_unknown_outcome")
    expect(recovered.requests[0]?.state).toBe("unknown_outcome")
  })

  it("fails a report that cites an ID not returned by a validated source", async () => {
    // Given
    const repository = store()
    const jobs = new ResearchJobs(
      repository,
      {
        search: async () => ({
          providerRequestId: "search-invalid-citation",
          results: [candidate],
        }),
        fetchSource: async () => fetched,
        readLocalSource: async () => fetched,
        runModel: async () => ({
          decision: {
            kind: "report",
            title: "Invalid report",
            markdown: "Unsupported",
            sourceIds: ["123e4567-e89b-42d3-a456-426614174099"],
          },
          inputTokens: 1,
          outputTokens: 1,
        }),
      },
      async () => ({ id: noteId }),
    )
    const preview = jobs.preview(input())

    // When
    jobs.start(preview.id)
    const result = await jobs.wait(preview.id)

    // Then
    expect(result.status).toBe("failed")
    expect(result.report).toBeNull()
    expect(result.error).toContain("unknown source ID")
  })

  it("stays paused after unavailable search until the user explicitly resumes", async () => {
    // Given
    const repository = store()
    let attempts = 0
    const jobs = new ResearchJobs(
      repository,
      {
        search: async () => {
          attempts += 1
          if (attempts === 1) {
            throw new WebDiscoveryError("capability_unavailable", "Official search is unavailable")
          }
          return { providerRequestId: "search-resumed", results: [candidate] }
        },
        fetchSource: async () => fetched,
        readLocalSource: async () => fetched,
        runModel: async () => ({
          decision: {
            kind: "report",
            title: "Resumed report",
            markdown: "Resumed only after user action.",
            sourceIds: [sourceId],
          },
          inputTokens: 2,
          outputTokens: 3,
        }),
      },
      async () => ({ id: noteId }),
    )
    const preview = jobs.preview({
      ...input(),
      budgets: { ...input().budgets, searchRounds: 2 },
    })

    // When
    jobs.start(preview.id)
    const paused = await jobs.wait(preview.id)

    // Then
    expect(paused.status).toBe("paused")
    expect(paused.pauseReason).toBe("search_unavailable")
    expect(attempts).toBe(1)

    // When
    jobs.resume(preview.id)
    const completed = await jobs.wait(preview.id)

    // Then
    expect(attempts).toBe(2)
    expect(completed.status).toBe("completed")
    expect(completed.providerUsage).toEqual({ state: "reported", inputTokens: 2, outputTokens: 3 })
  })

  it("cancels an in-flight request without running later phases", async () => {
    // Given
    const repository = store()
    const runModel = vi.fn<ResearchRuntime["runModel"]>()
    const search = vi.fn<ResearchRuntime["search"]>(
      async (_request, signal) =>
        await new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ providerRequestId: "late-search", results: [candidate] }),
            { once: true },
          )
        }),
    )
    const jobs = new ResearchJobs(
      repository,
      {
        search,
        fetchSource: async () => fetched,
        readLocalSource: async () => fetched,
        runModel,
      },
      async () => ({ id: noteId }),
    )
    const preview = jobs.preview(input())
    jobs.start(preview.id)
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce())

    // When
    const cancelled = jobs.cancel(preview.id)
    await jobs.wait(preview.id)

    // Then
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.requests.at(-1)?.state).toBe("failed")
    expect(repository.require(preview.id).sources).toEqual([])
    expect(runModel).not.toHaveBeenCalled()
  })

  it("waits for an active runner to settle before disposal returns", async () => {
    // Given
    const repository = store()
    const gate = new AbortController()
    const jobs = new ResearchJobs(
      repository,
      {
        search: async () =>
          await new Promise((resolve) => {
            gate.signal.addEventListener(
              "abort",
              () => resolve({ providerRequestId: "search-disposal", results: [] }),
              { once: true },
            )
          }),
        fetchSource: async () => fetched,
        readLocalSource: async () => fetched,
        runModel: async () => ({
          decision: { kind: "report", title: "No sources", markdown: "None", sourceIds: [] },
          inputTokens: null,
          outputTokens: null,
        }),
      },
      async () => ({ id: noteId }),
    )
    const preview = jobs.preview(input())
    jobs.start(preview.id)
    await Promise.resolve()

    // When
    let disposed = false
    const disposal = jobs.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()

    // Then
    expect(disposed).toBe(false)
    gate.abort()
    await disposal
    expect(disposed).toBe(true)
  })
})
