import { aiPolicy } from "../../shared/documentAiJobs"

const pageTranslationParallelism = aiPolicy.concurrentTextJobs

export async function runPageTranslationBatches<Input, Output>(
  batches: readonly (readonly Input[])[],
  translate: (batch: readonly Input[], index: number) => Promise<Output>,
  signal?: AbortSignal,
): Promise<readonly Output[]> {
  const outputs: Output[] = []
  let nextIndex = 0
  let aborted = false
  const worker = async (): Promise<void> => {
    while (!aborted && nextIndex < batches.length) {
      if (signal?.aborted) return
      const index = nextIndex
      nextIndex += 1
      const batch = batches[index]
      if (!batch) return
      try {
        outputs[index] = await translate(batch, index)
      } catch (error) {
        aborted = true
        throw error
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(pageTranslationParallelism, batches.length) }, worker),
  )
  return outputs
}
