import { describe, expect, it, vi } from "vitest"
import { runPageTranslationBatches } from "../../src/renderer/lib/pageTranslationRunner"
import { aiPolicy } from "../../src/shared/documentAiJobs"

describe("page translation batch runner", () => {
  it("starts batches up to the shared text-job limit before any completion resolves", async () => {
    const releases: Array<() => void> = []
    const translate = vi.fn(
      async (batch: readonly number[]) =>
        new Promise<readonly number[]>((resolve) => {
          releases.push(() => resolve(batch))
        }),
    )
    const batchCount = aiPolicy.concurrentTextJobs + 2
    const batches = Array.from({ length: batchCount }, (_, index) => [index])
    const operation = runPageTranslationBatches(batches, translate)

    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(aiPolicy.concurrentTextJobs))
    expect(translate).toHaveBeenCalledTimes(aiPolicy.concurrentTextJobs)
    for (const release of releases.splice(0)) release()
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(batchCount))
    for (const release of releases.splice(0)) release()

    await expect(operation).resolves.toEqual(batches)
  })
})
