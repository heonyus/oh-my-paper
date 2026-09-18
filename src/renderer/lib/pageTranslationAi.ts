import { aiPolicy } from "../../shared/documentAiJobs"
import type { AiRequestRunner } from "../types"
import {
  type PageSourceBlock,
  pageTranslationBlockIds,
  pageTranslationRequest,
  parsePageTranslationStream,
} from "./pageTranslationSource"
import { PaperAiJobError } from "./usePaperAiRequest"

type TranslationBatchInput = {
  readonly batch: readonly PageSourceBlock[]
  readonly page: number
  readonly onAiRequest: AiRequestRunner
  readonly onPartial: (translations: ReadonlyMap<string, string>) => void
  readonly signal?: AbortSignal
}

type TranslationSlotWaiter = {
  readonly resolve: (release: () => void) => void
  readonly reject: (error: unknown) => void
  readonly signal: AbortSignal | undefined
  abort: () => void
  cancelled: boolean
}

let activeTranslationRequests = 0
const translationSlotQueue: TranslationSlotWaiter[] = []

function pumpTranslationSlots(): void {
  while (activeTranslationRequests < aiPolicy.concurrentTextJobs) {
    const waiter = translationSlotQueue.shift()
    if (!waiter) return
    if (waiter.cancelled) continue
    activeTranslationRequests += 1
    const release = (): void => {
      if (activeTranslationRequests === 0) return
      activeTranslationRequests -= 1
      pumpTranslationSlots()
    }
    waiter.signal?.removeEventListener("abort", waiter.abort)
    waiter.resolve(release)
  }
}

async function withTranslationSlot<T>(
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const release = await new Promise<() => void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PaperAiJobError("cancelled"))
      return
    }
    if (activeTranslationRequests < aiPolicy.concurrentTextJobs) {
      activeTranslationRequests += 1
      resolve(() => {
        activeTranslationRequests -= 1
        pumpTranslationSlots()
      })
      return
    }
    const waiter: TranslationSlotWaiter = {
      resolve,
      reject,
      signal,
      cancelled: false,
      abort: () => undefined,
    }
    waiter.abort = (): void => {
      if (waiter.cancelled) return
      waiter.cancelled = true
      signal?.removeEventListener("abort", waiter.abort)
      reject(new PaperAiJobError("cancelled"))
    }
    translationSlotQueue.push(waiter)
    signal?.addEventListener("abort", waiter.abort, { once: true })
    pumpTranslationSlots()
  })
  try {
    return await run()
  } finally {
    release()
  }
}

export function isRecoverableAiError(error: unknown): boolean {
  if (error instanceof PaperAiJobError) {
    return error.code === "provider_error" || error.code === "timeout"
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (
      msg.includes("cancel") ||
      msg.includes("abort") ||
      msg.includes("auth") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("rate limit") ||
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("429")
    ) {
      return false
    }
    return true
  }
  return false
}

export function extractPartialTranslations(
  accumulated: string,
  blocks: readonly PageSourceBlock[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>()
  const itemRegex =
    /\{\s*"id"\s*:\s*"([A-Za-z0-9._:-]+)"\s*,\s*"markdown"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/gu
  let match: RegExpExecArray | null = null
  let expectedIndex = 0

  while (true) {
    match = itemRegex.exec(accumulated)
    if (!match) break
    const id = match[1]
    const rawMarkdown = match[2]
    if (!id || rawMarkdown === undefined) break

    while (expectedIndex < blocks.length && blocks[expectedIndex]?.id !== id) {
      expectedIndex += 1
    }
    if (expectedIndex >= blocks.length) {
      break
    }
    expectedIndex += 1

    try {
      const markdown = JSON.parse(`"${rawMarkdown}"`)
      if (typeof markdown === "string" && markdown.trim().length > 0) {
        result.set(id, markdown)
      }
    } catch {
      // Invalid escape sequence, skip
    }
  }

  return result
}

function assertOrderedSubset(response: string, blocks: readonly PageSourceBlock[]): void {
  let expectedIndex = 0
  for (const id of pageTranslationBlockIds(response)) {
    while (expectedIndex < blocks.length && blocks[expectedIndex]?.id !== id) expectedIndex += 1
    if (expectedIndex >= blocks.length) throw new Error("page translation block order mismatch")
    expectedIndex += 1
  }
}

async function requestBlocks(
  input: TranslationBatchInput,
  blocks: readonly PageSourceBlock[],
): Promise<ReadonlyMap<string, string>> {
  const request = {
    action: "page_translation" as const,
    page: input.page,
    quote: pageTranslationRequest(blocks),
    before: "",
    after: "",
  }
  let accumulated = ""
  let emittedCount = 0
  const onDelta = (delta: string): void => {
    if (input.signal?.aborted) return
    accumulated += delta
    const partials = extractPartialTranslations(accumulated, blocks)
    if (partials.size > emittedCount) {
      emittedCount = partials.size
      input.onPartial(partials)
    }
  }
  let result: string
  try {
    result = await withTranslationSlot(input.signal, () =>
      input.onAiRequest(request, onDelta, input.signal),
    )
  } catch (error) {
    if (input.signal?.aborted || !isRecoverableAiError(error)) throw error
    accumulated = ""
    emittedCount = 0
    result = await withTranslationSlot(input.signal, () =>
      input.onAiRequest(request, onDelta, input.signal),
    )
  }
  assertOrderedSubset(result, blocks)
  const parsed = parsePageTranslationStream(result)
  input.onPartial(parsed)
  return parsed
}

export async function translatePageBatch(
  input: TranslationBatchInput,
): Promise<ReadonlyMap<string, string>> {
  const translated = new Map(await requestBlocks(input, input.batch))
  if (input.signal?.aborted) return translated
  const missing = input.batch.filter((block) => !translated.get(block.id)?.trim())
  if (missing.length > 0 && !input.signal?.aborted) {
    const retried = await requestBlocks(input, missing)
    for (const [id, value] of retried) translated.set(id, value)
  }
  const unresolved = input.batch.find((block) => !translated.get(block.id)?.trim())
  if (unresolved) throw new Error(`missing page translation block ${unresolved.id}`)
  return translated
}
