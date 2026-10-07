import type { PageTranslationBlock } from "./pageTranslationSource"

/**
 * The translation units each open translation pane shows, by page, so a selection made in a
 * pane can be read back to the source sentences it covers.
 */
const blocksByPage = new Map<number, readonly PageTranslationBlock[]>()

export function publishPageTranslationBlocks(
  page: number,
  blocks: readonly PageTranslationBlock[],
): void {
  blocksByPage.set(page, blocks)
}

export function clearPageTranslationBlocks(page: number): void {
  blocksByPage.delete(page)
}

export function pageTranslationBlocks(page: number): readonly PageTranslationBlock[] {
  return blocksByPage.get(page) ?? []
}
