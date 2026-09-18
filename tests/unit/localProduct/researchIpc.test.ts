// @vitest-environment node
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { createResearchPreload, type ResearchRenderer } from "../../../src/electron/preloadResearch"
import {
  type ResearchIpcMain,
  registerResearchIpc,
} from "../../../src/electron/registerResearchIpc"
import type { ResearchRuntime } from "../../../src/electron/researchJobRuntime"
import { ResearchJobStore } from "../../../src/electron/researchJobStore"
import { ResearchJobs } from "../../../src/electron/researchJobs"
import { knowledgeNodeIdSchema } from "../../../src/shared/knowledgeSchemas"

type Handler = (event: unknown, payload: unknown) => Promise<unknown> | unknown

class FakeIpc implements ResearchIpcMain, ResearchRenderer {
  private readonly handlers = new Map<string, Handler>()

  readonly handle = (channel: string, listener: Handler): void => {
    this.handlers.set(channel, listener)
  }

  readonly removeHandler = (channel: string): void => {
    this.handlers.delete(channel)
  }

  readonly invoke = async (channel: string, payload: unknown): Promise<unknown> => {
    const handler = this.handlers.get(channel)
    if (handler === undefined) throw new Error(`Missing handler: ${channel}`)
    return await handler({}, payload)
  }
}

describe("research IPC boundary", () => {
  it("validates a preview round trip without starting research", async () => {
    // Given
    const db = new DatabaseSync(":memory:")
    const runtime: ResearchRuntime = {
      search: async () => {
        throw new Error("Search must not run during preview")
      },
      fetchSource: async () => {
        throw new Error("Fetch must not run during preview")
      },
      readLocalSource: async () => {
        throw new Error("Local reading must not run during preview")
      },
      runModel: async () => {
        throw new Error("Model must not run during preview")
      },
    }
    const jobs = new ResearchJobs(new ResearchJobStore(db), runtime, async () => ({
      id: knowledgeNodeIdSchema.parse("123e4567-e89b-42d3-a456-426614174030"),
    }))
    const ipc = new FakeIpc()
    const unregister = registerResearchIpc(jobs, ipc)
    const api = createResearchPreload(ipc)

    // When
    const preview = await api.preview({
      input: {
        question: "Is the IPC boundary explicit?",
        provider: "codex_subscription",
        scope: { external: true, localSourceIds: [] },
      },
    })

    // Then
    expect(preview.status).toBe("awaiting_start")
    expect(preview.input.budgets).toEqual({
      searchRounds: 5,
      sources: 20,
      minutes: 15,
      modelTurns: 20,
    })
    await unregister()
    db.close()
  })
})
