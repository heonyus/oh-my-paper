import type { DocumentPageParseProgress } from "../../shared/documentPageModel"
import { isPlaceholderPageTranslation } from "./pageTranslationJson"
import type { PageTranslationBlock } from "./pageTranslationSource"

export type TranslationStatus =
  | "waiting"
  | "parser-running"
  | "parser-unavailable"
  | "streaming"
  | "complete"
  | "setup"
  | "failed"

export type TextSize = "normal" | "large" | "largest"

export function parserStageMessage(stage: DocumentPageParseProgress["stage"]): string {
  switch (stage) {
    case "engine-starting":
      return "문서 인식 엔진을 준비하고 있습니다."
    case "page-rendering":
      return "현재 페이지를 읽고 있습니다."
    case "document-analyzing":
      return "문단, 읽기 순서와 수식을 분석하고 있습니다."
    case "finalizing":
      return "번역할 문장들을 정리하고 있습니다."
  }
  const unreachable: never = stage
  return unreachable
}

export function nextTextSize(size: TextSize): TextSize {
  if (size === "normal") return "large"
  if (size === "large") return "largest"
  return "normal"
}

export function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function mergePageTranslations(
  blocks: readonly PageTranslationBlock[],
  translations: ReadonlyMap<string, string>,
): readonly PageTranslationBlock[] {
  let changed = false
  const next = blocks.map((block) => {
    const translation = translations.get(block.id)
    if (translation === undefined || translation === block.translation) return block
    changed = true
    return { ...block, translation }
  })
  return changed ? next : blocks
}

function sourceKey(source: string): string {
  return source
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim()
}

/**
 * The cached translations still true of the page's current translation units, by unit id: a
 * unit keeps a cached translation of the very same source text, under its own id or — after
 * a parser change renumbered the page's blocks — another's. A unit whose source changed is
 * left out, so only it is translated again. `complete` says the cache holds exactly the
 * current units. `cached` may hold several earlier translations of the page, the preferred
 * first: the first translation of a unit or a source text is the one kept.
 */
export function reusablePageTranslations(
  cached: readonly PageTranslationBlock[],
  current: readonly { readonly id: string; readonly source: string }[],
): { readonly translations: ReadonlyMap<string, string>; readonly complete: boolean } {
  const byId = new Map<string, PageTranslationBlock>()
  for (const block of cached) if (!byId.has(block.id)) byId.set(block.id, block)
  // A model's note that it had nothing to translate is no translation to keep.
  const usable = (translation: string) =>
    translation.trim().length > 0 && !isPlaceholderPageTranslation(translation)
  const bySource = new Map<string, string>()
  for (const block of cached) {
    const key = sourceKey(block.source)
    if (usable(block.translation) && !bySource.has(key)) bySource.set(key, block.translation)
  }
  const translations = new Map<string, string>()
  let sameUnits = cached.length === current.length
  for (const unit of current) {
    const key = sourceKey(unit.source)
    const block = byId.get(unit.id)
    const same = block !== undefined && sourceKey(block.source) === key
    if (!same) sameUnits = false
    const translation = same && usable(block.translation) ? block.translation : bySource.get(key)
    if (translation) translations.set(unit.id, translation)
  }
  return { translations, complete: sameUnits && translations.size === current.length }
}
