import type { DocumentPageParseProgress } from "../../shared/documentPageModel"
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
