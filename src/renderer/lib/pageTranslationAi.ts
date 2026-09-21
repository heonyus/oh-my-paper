import { aiPolicy } from "../../shared/documentAiJobs"
import type { AiRequestRunner } from "../types"
import { parsePageTranslationResponse } from "./pageTranslationJson"
import {
  type PageSourceBlock,
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

class InvalidPageTranslationResponseError extends Error {
  readonly name = "InvalidPageTranslationResponseError"
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
  if (error instanceof InvalidPageTranslationResponseError) return false
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
  const expectedIds = new Set(blocks.map((block) => block.id))
  const seenIds = new Set<string>()

  while (true) {
    match = itemRegex.exec(accumulated)
    if (!match) break
    const id = match[1]
    const rawMarkdown = match[2]
    if (!id || rawMarkdown === undefined) break

    if (!expectedIds.has(id) || seenIds.has(id)) continue
    seenIds.add(id)

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

function assertKnownUniqueIds(response: string, blocks: readonly PageSourceBlock[]): void {
  const expectedIds = new Set(blocks.map((block) => block.id))
  const seenIds = new Set<string>()
  const parsed = parsePageTranslationResponse(response)
  if (!parsed)
    throw new InvalidPageTranslationResponseError("page translation response is malformed")
  for (const { id } of parsed.translations) {
    if (!expectedIds.has(id))
      throw new InvalidPageTranslationResponseError(
        "page translation response contains unknown block",
      )
    if (seenIds.has(id))
      throw new InvalidPageTranslationResponseError(
        "page translation response contains duplicate block",
      )
    seenIds.add(id)
  }
}

function wireBlocksForRequest(blocks: readonly PageSourceBlock[]): {
  readonly blocks: readonly PageSourceBlock[]
  readonly stableIds: ReadonlyMap<string, string>
} {
  const stableIds = new Map<string, string>()
  const wireBlocks = blocks.map((block, index) => {
    const wireId = `b${index}`
    stableIds.set(wireId, block.id)
    return { ...block, id: wireId }
  })
  return { blocks: wireBlocks, stableIds }
}

function restoreStableIds(
  translations: ReadonlyMap<string, string>,
  stableIds: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  return new Map(
    [...translations].flatMap(([wireId, value]) => {
      const stableId = stableIds.get(wireId)
      return stableId ? [[stableId, value] as const] : []
    }),
  )
}

async function requestBlocks(
  input: TranslationBatchInput,
  blocks: readonly PageSourceBlock[],
  allowRecovery = true,
): Promise<ReadonlyMap<string, string>> {
  const wire = wireBlocksForRequest(blocks)
  const request = {
    action: "page_translation" as const,
    page: input.page,
    quote: pageTranslationRequest(wire.blocks),
    before: "",
    after: "",
  }
  let accumulated = ""
  let emittedCount = 0
  const onDelta = (delta: string): void => {
    if (input.signal?.aborted) return
    accumulated += delta
    const partials = extractPartialTranslations(accumulated, wire.blocks)
    if (partials.size > emittedCount) {
      emittedCount = partials.size
      input.onPartial(restoreStableIds(partials, wire.stableIds))
    }
  }
  let result: string
  try {
    result = await withTranslationSlot(input.signal, () =>
      input.onAiRequest(request, onDelta, input.signal),
    )
  } catch (error) {
    if (input.signal?.aborted || !allowRecovery || !isRecoverableAiError(error)) throw error
    const wirePartials = extractPartialTranslations(accumulated, wire.blocks)
    const partials = restoreStableIds(wirePartials, wire.stableIds)
    if (partials.size > 0) input.onPartial(partials)
    const missing = blocks.filter((block) => !partials.get(block.id)?.trim())
    if (missing.length === 0) return partials
    const retried = await requestBlocks(input, missing, false)
    return new Map([...partials, ...retried])
  }
  assertKnownUniqueIds(result, wire.blocks)
  const parsed = parsePageTranslationStream(result)
  const restored = restoreStableIds(parsed, wire.stableIds)
  input.onPartial(restored)
  return restored
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
