import { describe, expect, it, vi } from "vitest"
import { runPageTranslationBatches } from "../../src/renderer/lib/pageTranslationRunner"

describe("page translation batch runner", () => {
  it("starts two long-page batches before either completion resolves", async () => {
    const releases: Array<() => void> = []
    const translate = vi.fn(
      async (batch: readonly number[]) =>
        new Promise<readonly number[]>((resolve) => {
          releases.push(() => resolve(batch))
        }),
    )
    const operation = runPageTranslationBatches([[1], [2], [3]], translate)

    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
    releases[0]?.()
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(3))
    releases[1]?.()
    releases[2]?.()

    await expect(operation).resolves.toEqual([[1], [2], [3]])
  })
})
