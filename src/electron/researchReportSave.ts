import type { ResearchJobSnapshot } from "../shared/researchJobSchemas"
import { researchJobIdSchema, researchJobSnapshotSchema } from "../shared/researchJobSchemas"
import type { ResearchJobStore } from "./researchJobStore"
import { type ResearchNoteCreator, reportNoteInput } from "./researchReport"

export async function saveResearchReport(
  store: ResearchJobStore,
  createNode: ResearchNoteCreator,
  clock: () => string,
  raw: { readonly jobId: string; readonly title: string; readonly markdown: string },
): Promise<ResearchJobSnapshot> {
  const id = researchJobIdSchema.parse(raw.jobId)
  const job = store.require(id)
  if (job.status !== "completed" || job.phase !== "report_ready" || job.report === null) {
    throw new Error("Only a completed report draft can be saved")
  }
  const now = clock()
  store.save(
    researchJobSnapshotSchema.parse({
      ...job,
      status: "running",
      phase: "saving",
      activeSince: now,
      updatedAt: now,
    }),
  )
  try {
    const node = await createNode(reportNoteInput(id, job.report, raw.title, raw.markdown))
    return store.update(id, (current) =>
      researchJobSnapshotSchema.parse({
        ...current,
        status: "completed",
        phase: "saved",
        reportNodeId: node.id,
        activeSince: null,
        updatedAt: clock(),
      }),
    )
  } catch (error) {
    store.save(
      researchJobSnapshotSchema.parse({
        ...job,
        error: error instanceof Error ? error.message.slice(0, 2_000) : "Report save failed",
        updatedAt: clock(),
      }),
    )
    throw error
  }
}
