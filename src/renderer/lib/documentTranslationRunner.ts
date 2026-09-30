import { type Locale, translator } from "../../shared/i18n/locale"
import type { ProviderStatus } from "../../shared/ipc"
import { readerMessages } from "../messages/reader"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { loadParsedDocumentPage } from "./documentPageRuntime"
import { translatePageBatch } from "./pageTranslationAi"
import {
  readCachedPageTranslation,
  storeCachedPageTranslation,
} from "./pageTranslationCacheRuntime"
import { withPageTranslationCitationLinks } from "./pageTranslationCitations"
import { reusablePageTranslations } from "./pageTranslationPaneState"
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
  /** The language of a failure's detail when the error carries no message; Korean when left out. */
  readonly locale?: Locale | undefined
}

export type DocumentTranslationStage =
  | "ocr-status"
  | "parse"
  | "cache-read"
  | "planning"
  | "ui-update"
  | "translation"
  | "cache-write"

function safeErrorMessage(error: unknown, locale: Locale): string {
  const unknown = translator(readerMessages, locale)("translation.error.unknown")
  if (!(error instanceof Error)) return unknown
  const message = error.message.trim().replace(/\s+/gu, " ")
  return message.length > 180 ? `${message.slice(0, 177)}...` : message || unknown
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
  locale: Locale,
  page: number,
  stage: DocumentTranslationStage,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof DocumentTranslationError) throw error
    throw new DocumentTranslationError(page, stage, safeErrorMessage(error, locale))
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
    throw new DocumentTranslationError(
      page,
      "ui-update",
      safeErrorMessage(error, input.locale ?? "ko"),
    )
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
    throw new DocumentTranslationError(
      page,
      "ui-update",
      safeErrorMessage(error, input.locale ?? "ko"),
    )
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
  const locale = input.locale ?? "ko"
  let completedPages = 0
  let completedBlocks = 0
  let totalBlocks = 0

  // 다음 페이지의 파싱과 캐시 읽기를 현재 페이지 번역과 겹쳐서 진행한다
  const preparePage = async (page: number) => {
    const parsedPage = await runStage(locale, page, "parse", () =>
      loadParsedDocumentPage(input.document.id, page, {
        awaitStructure: true,
        signal: input.signal,
      }),
    )
    if (input.signal.aborted) return null
    if (!parsedPage)
      throw new DocumentTranslationError(page, "parse", "parser unavailable or cancelled")
    const parserCached = await runStage(locale, page, "cache-read", () =>
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
    const planned = await runStage(locale, page, "planning", async () => {
      const source = withPageTranslationCitationLinks(
        pageTranslationBlocksFromParsedPage(parsedPage),
        input.citations,
      )
      const plan = planParsedPageTranslations(source)
      // A page translated under an earlier parser or by another model keeps every sentence
      // whose source is unchanged.
      const earlier = await readCachedPageTranslation(input.document.id, page, input.provider)
      const reused = earlier
        ? reusablePageTranslations(earlier, source).translations
        : new Map<string, string>()
      return { plan, reused }
    })
    const { plan, reused } = planned
    const completed = new Map([...plan.completed, ...reused])
    const batches = pageTranslationBatches(
      plan.translatable.filter((block) => !completed.has(block.id)),
    )
    totalBlocks += plan.initial.length
    let pageCompletedBlocks = plan.initial.filter((block) => block.translation).length
    notifyPageBlocks(input, page, completeBlocks(plan.initial, completed))
    notifyProgress(input, page, {
      pageCount: input.document.pageCount,
      completedPages,
      completedBlocks,
      totalBlocks,
    })

    await runStage(locale, page, "translation", () =>
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
    await runStage(locale, page, "cache-write", () =>
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
