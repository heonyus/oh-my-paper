import type { ProviderStatus } from "../../shared/ipc"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { loadParsedDocumentPage } from "./documentPageRuntime"
import { translatePageBatch } from "./pageTranslationAi"
import {
  readCachedPageTranslation,
  storeCachedPageTranslation,
} from "./pageTranslationCacheRuntime"
import { withPageTranslationCitationLinks } from "./pageTranslationCitations"
import { runPageTranslationBatches } from "./pageTranslationRunner"
import { type PageTranslationBlock, pageTranslationBatches } from "./pageTranslationSource"
import {
  type ParsedPageTranslationBlock,
  pageTranslationBlocksFromParsedPage,
  planParsedPageTranslations,
} from "./parsedPageTranslation"
import type { CitationIndexEntry } from "./pdfCitationIndex"

export type DocumentTranslationProgress = {
  readonly page: number
  readonly pageCount: number
  readonly completedPages: number
  readonly completedBlocks: number
  readonly totalBlocks: number
}

export type DocumentTranslationRunnerInput = {
  readonly document: DocumentRecord
  readonly citations: readonly CitationIndexEntry[]
  readonly provider: ProviderStatus
  readonly onAiRequest: AiRequestRunner
  readonly signal: AbortSignal
  readonly onProgress: (progress: DocumentTranslationProgress) => void
  readonly onPageBlocks: (page: number, blocks: readonly PageTranslationBlock[]) => void
}

export type DocumentTranslationStage =
  | "ocr-status"
  | "parse"
  | "cache-read"
  | "planning"
  | "ui-update"
  | "translation"
  | "cache-write"

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "알 수 없는 오류"
  const message = error.message.trim().replace(/\s+/gu, " ")
  return message.length > 180 ? `${message.slice(0, 177)}...` : message || "알 수 없는 오류"
}

export class DocumentTranslationError extends Error {
  readonly name = "DocumentTranslationError"

  constructor(
    readonly page: number,
    readonly stage: DocumentTranslationStage,
    readonly detail: string,
  ) {
    super(`page=${page} stage=${stage}: ${detail}`)
  }
}

async function runStage<T>(
  page: number,
  stage: DocumentTranslationStage,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof DocumentTranslationError) throw error
    throw new DocumentTranslationError(page, stage, safeErrorMessage(error))
  }
}

function notifyPageBlocks(
  input: DocumentTranslationRunnerInput,
  page: number,
  blocks: readonly PageTranslationBlock[],
): void {
  try {
    input.onPageBlocks(page, blocks)
  } catch (error) {
    throw new DocumentTranslationError(page, "ui-update", safeErrorMessage(error))
  }
}

function notifyProgress(
  input: DocumentTranslationRunnerInput,
  page: number,
  progress: Omit<DocumentTranslationProgress, "page">,
): void {
  try {
    input.onProgress({ page, ...progress })
  } catch (error) {
    throw new DocumentTranslationError(page, "ui-update", safeErrorMessage(error))
  }
}

function completeBlocks(
  blocks: readonly ParsedPageTranslationBlock[],
  translations: ReadonlyMap<string, string>,
): readonly PageTranslationBlock[] {
  return blocks.map((block) => ({
    ...block,
    translation: translations.get(block.id) ?? "",
  }))
}

export async function translateDocumentPages(input: DocumentTranslationRunnerInput): Promise<void> {
  let completedPages = 0
  let completedBlocks = 0
  let totalBlocks = 0

  // 다음 페이지의 파싱과 캐시 읽기를 현재 페이지 번역과 겹쳐서 진행한다
  const preparePage = async (page: number) => {
    const parsedPage = await runStage(page, "parse", () =>
      loadParsedDocumentPage(input.document.id, page, {
        signal: input.signal,
      }),
    )
    if (input.signal.aborted) return null
    if (!parsedPage)
      throw new DocumentTranslationError(page, "parse", "parser unavailable or cancelled")
    const parserCached = await runStage(page, "cache-read", () =>
      readCachedPageTranslation(
        input.document.id,
        page,
        input.provider,
        parsedPage.parser,
        parsedPage.configVersion,
      ),
    )
    return { parsedPage, parserCached }
  }

  let prepared: ReturnType<typeof preparePage> | null = preparePage(1)
  prepared.catch(() => undefined)
  for (let page = 1; page <= input.document.pageCount; page += 1) {
    if (input.signal.aborted) return
    const current = await prepared
    prepared = page < input.document.pageCount ? preparePage(page + 1) : null
    prepared?.catch(() => undefined)
    if (!current) return
    const { parsedPage, parserCached } = current
    if (parserCached) {
      completedPages += 1
      completedBlocks += parserCached.length
      totalBlocks = Math.max(totalBlocks, completedBlocks)
      notifyPageBlocks(input, page, parserCached)
      notifyProgress(input, page, {
        pageCount: input.document.pageCount,
        completedPages,
        completedBlocks,
        totalBlocks,
      })
      continue
    }
    const planned = await runStage(page, "planning", async () => {
      const source = withPageTranslationCitationLinks(
        pageTranslationBlocksFromParsedPage(parsedPage),
        input.citations,
      )
      const plan = planParsedPageTranslations(source)
      return { plan }
    })
    const { plan } = planned
    const completed = new Map(plan.completed)
    const batches = pageTranslationBatches(plan.translatable)
    totalBlocks += plan.initial.length
    let pageCompletedBlocks = plan.initial.filter((block) => block.translation).length
    notifyPageBlocks(input, page, completeBlocks(plan.initial, completed))
    notifyProgress(input, page, {
      pageCount: input.document.pageCount,
      completedPages,
      completedBlocks,
      totalBlocks,
    })

    await runStage(page, "translation", () =>
      runPageTranslationBatches(
        batches,
        async (batch) => {
          const translated = await translatePageBatch({
            batch,
            page,
            onAiRequest: input.onAiRequest,
            signal: input.signal,
            onPartial: (partial) => {
              for (const [id, value] of partial) completed.set(id, value)
              notifyPageBlocks(input, page, completeBlocks(plan.initial, completed))
            },
          })
          for (const [id, value] of translated) completed.set(id, value)
          const current = completeBlocks(plan.initial, completed)
          pageCompletedBlocks = current.filter((block) => block.translation.trim()).length
          notifyPageBlocks(input, page, current)
          notifyProgress(input, page, {
            pageCount: input.document.pageCount,
            completedPages,
            completedBlocks: completedBlocks + pageCompletedBlocks,
            totalBlocks,
          })
          return translated
        },
        input.signal,
      ),
    )
    if (input.signal.aborted) return

    const finished = completeBlocks(plan.initial, completed)
    if (finished.some((block) => !block.translation.trim()))
      throw new Error(`incomplete page translation: ${page}`)
    await runStage(page, "cache-write", () =>
      storeCachedPageTranslation(input.document.id, page, input.provider, finished),
    )
    completedBlocks += pageCompletedBlocks
    completedPages += 1
    notifyPageBlocks(input, page, finished)
    notifyProgress(input, page, {
      pageCount: input.document.pageCount,
      completedPages,
      completedBlocks,
      totalBlocks,
    })
  }
}
