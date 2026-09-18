import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import {
  type ParsedResearchPreviewInput,
  type ResearchJobId,
  type ResearchJobSnapshot,
  researchJobIdSchema,
  researchJobSnapshotSchema,
  researchPreviewInputSchema,
} from "../shared/researchJobSchemas"

const snapshotRowSchema = z.object({ snapshot_json: z.string() }).readonly()

function interrupted(snapshot: ResearchJobSnapshot, now: string): ResearchJobSnapshot {
  const activeSince = snapshot.activeSince === null ? null : Date.parse(snapshot.activeSince)
  const elapsed =
    activeSince === null ? snapshot.elapsedMs : snapshot.elapsedMs + Date.parse(now) - activeSince
  return researchJobSnapshotSchema.parse({
    ...snapshot,
    status: "paused",
    phase: snapshot.phase === "saving" ? "report_ready" : snapshot.phase,
    pauseReason: "restart_unknown_outcome",
    requests: snapshot.requests.map((request) =>
      request.state === "pending"
        ? { ...request, state: "unknown_outcome", completedAt: now }
        : request,
    ),
    warnings: [
      ...snapshot.warnings,
      "The app restarted during an external call; its outcome is unknown.",
    ],
    elapsedMs: Math.max(0, elapsed),
    activeSince: null,
    updatedAt: now,
  })
}

export class ResearchJobStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = randomUUID,
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS research_jobs (
        id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `)
    this.pauseInterrupted()
  }

  create(rawInput: unknown): ResearchJobSnapshot {
    const input: ParsedResearchPreviewInput = researchPreviewInputSchema.parse(rawInput)
    const now = this.clock()
    const snapshot = researchJobSnapshotSchema.parse({
      id: researchJobIdSchema.parse(this.idFactory()),
      input,
      status: "awaiting_start",
      phase: "preview",
      pauseReason: null,
      error: null,
      counts: { searchRounds: 0, sourcesAttempted: 0, sourcesRetrieved: 0, modelTurns: 0 },
      sources: [],
      discoveredSources: [],
      requests: [],
      checkpoint: { localSourceIndex: 0, searchComplete: false, nextSourceIndex: 0 },
      nextQuery: input.question,
      report: null,
      reportNodeId: null,
      providerUsage: { state: "unknown" },
      warnings: [],
      elapsedMs: 0,
      activeSince: null,
      startedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    this.save(snapshot)
    return snapshot
  }

  get(id: ResearchJobId): ResearchJobSnapshot | null {
    const raw = this.db.prepare("SELECT snapshot_json FROM research_jobs WHERE id = ?").get(id)
    if (raw === undefined) return null
    const row = snapshotRowSchema.parse(raw)
    return researchJobSnapshotSchema.parse(JSON.parse(row.snapshot_json))
  }

  require(id: ResearchJobId): ResearchJobSnapshot {
    const snapshot = this.get(id)
    if (snapshot === null) throw new Error(`Unknown research job: ${id}`)
    return snapshot
  }

  list(limit = 50): readonly ResearchJobSnapshot[] {
    const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), 100)
    return z
      .array(snapshotRowSchema)
      .parse(
        this.db
          .prepare("SELECT snapshot_json FROM research_jobs ORDER BY updated_at DESC LIMIT ?")
          .all(boundedLimit),
      )
      .map((row) => researchJobSnapshotSchema.parse(JSON.parse(row.snapshot_json)))
  }

  save(raw: ResearchJobSnapshot): ResearchJobSnapshot {
    const snapshot = researchJobSnapshotSchema.parse(raw)
    this.db
      .prepare(
        `INSERT INTO research_jobs (id, snapshot_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET snapshot_json = excluded.snapshot_json,
           updated_at = excluded.updated_at`,
      )
      .run(snapshot.id, JSON.stringify(snapshot), snapshot.updatedAt)
    return snapshot
  }

  update(
    id: ResearchJobId,
    updater: (snapshot: ResearchJobSnapshot) => ResearchJobSnapshot,
  ): ResearchJobSnapshot {
    return this.save(updater(this.require(id)))
  }

  private pauseInterrupted(): void {
    const rows = z
      .array(snapshotRowSchema)
      .parse(this.db.prepare("SELECT snapshot_json FROM research_jobs").all())
    const now = this.clock()
    for (const row of rows) {
      const snapshot = researchJobSnapshotSchema.parse(JSON.parse(row.snapshot_json))
      if (snapshot.status === "running") this.save(interrupted(snapshot, now))
    }
  }
}
