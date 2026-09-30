import type { JSX } from "react"
import { createPortal } from "react-dom"
import { useTranslator } from "../lib/locale"
import type { PageTranslationMode } from "../lib/pageTranslationMode"
import type { PageTranslationBlock as TranslationBlock } from "../lib/pageTranslationSource"
import { readerMessages } from "../messages/reader"
import { PageTranslationBlock } from "./PageTranslationBlock"

export function printableDocumentTitle(
  documentTitle: string,
  pages: Readonly<Record<number, readonly TranslationBlock[]>>,
): string {
  if (!/^\d{10,}[-_]/u.test(documentTitle.trim())) return documentTitle
  const heading = Object.entries(pages)
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([, blocks]) => blocks)
    .find((block) => block.kind === "heading" && block.source.trim().length > 0)
  return heading?.source.replace(/^#+\s*/u, "").trim() || documentTitle
}

function bilingualGroups(
  blocks: readonly TranslationBlock[],
): readonly (readonly TranslationBlock[])[] {
  const groups: TranslationBlock[][] = []
  for (const block of blocks) {
    const previous = groups.at(-1)
    if (
      previous &&
      block.parsedBlockId !== undefined &&
      previous[0]?.parsedBlockId === block.parsedBlockId
    )
      previous.push(block)
    else groups.push([block])
  }
  return groups
}

export function PageTranslationPrintDocument({
  documentTitle,
  mode,
  pages,
  pageImages,
}: {
  readonly documentTitle: string
  readonly mode: PageTranslationMode
  readonly pages: Readonly<Record<number, readonly TranslationBlock[]>>
  readonly pageImages: Readonly<Record<number, string>>
}): JSX.Element {
  const t = useTranslator(readerMessages)
  const orderedPages = Object.entries(pages).sort(([left], [right]) => Number(left) - Number(right))
  return createPortal(
    <main
      className="page-translation-print-document"
      aria-label={t("translation.printDocument")}
      data-mode={mode}
    >
      <h1>{printableDocumentTitle(documentTitle, pages)}</h1>
      {orderedPages.map(([pageKey, blocks]) => {
        const page = Number(pageKey)
        const image = pageImages[page]
        const groups =
          mode === "bilingual" ? bilingualGroups(blocks) : blocks.map((block) => [block])
        return (
          <article
            key={pageKey}
            className="page-translation-print-page"
            aria-label={t("translation.printPage", { page })}
          >
            <h2>p. {page}</h2>
            <div className="page-translation-print-page-content">
              {mode !== "bilingual" && image ? (
                <img src={image} alt={t("translation.printImage", { page })} />
              ) : null}
              {mode !== "source" || !image ? (
                <section
                  className="page-translation-print-blocks"
                  aria-label={t("translation.printBlocks", { page })}
                >
                  {groups.map((group, index) => {
                    const block = group[0]
                    if (!block) return null
                    return (
                      <PageTranslationBlock
                        key={block.id}
                        block={block}
                        page={page}
                        mode={mode === "bilingual" ? "bilingual" : "parallel"}
                        group={mode === "bilingual" ? group : undefined}
                        startsGroup={index === 0}
                      />
                    )
                  })}
                </section>
              ) : null}
            </div>
          </article>
        )
      })}
    </main>,
    document.body,
  )
}
