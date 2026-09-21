import { ArrowUpLeft } from "lucide-react"
import type { JSX } from "react"
import type { PageTranslationMode } from "../lib/pageTranslationMode"
import {
  type PageTranslationBlock as Block,
  focusPageSource,
  setPageSourceActive,
} from "../lib/pageTranslationSource"
import { MarkdownContent } from "./MarkdownContent"
import { PageTranslationFigure } from "./PageTranslationFigure"

export function PageTranslationBlock({
  block,
  page,
  startsGroup,
  mode,
  group,
}: {
  readonly block: Block
  readonly page: number
  readonly startsGroup: boolean
  readonly mode: PageTranslationMode
  readonly group?: readonly Block[] | undefined
}): JSX.Element {
  const blocks = group ?? [block]

  function setActive(active: boolean): void {
    for (const candidate of blocks) setPageSourceActive(page, candidate.id, active)
  }

  function focusSource(): void {
    focusPageSource(page, block.id)
  }

  const sourceText = blocks.map((candidate) => candidate.source).join(" ")
  const translationText = blocks
    .map((candidate) => candidate.translation.trim() || "_이 문단은 아직 번역되지 않았습니다._")
    .join(" ")
  const figure =
    block.structureKind === "figure" ? <PageTranslationFigure block={block} page={page} /> : null
  const source = figure ?? (
    <button
      type="button"
      className="page-translation-source"
      aria-label="원문으로 이동"
      onFocus={focusSource}
      onClick={focusSource}
    >
      <MarkdownContent source={sourceText} />
    </button>
  )
  const translation = figure ?? (
    <div className="page-translation-result">
      <button
        type="button"
        className="page-translation-focus-source"
        aria-label="번역에서 원문 위치로 이동"
        onClick={(event) => {
          event.stopPropagation()
          focusSource()
        }}
      >
        <ArrowUpLeft size={14} aria-hidden="true" />
      </button>
      <MarkdownContent source={translationText} />
    </div>
  )

  return (
    <article
      className="page-translation-block"
      data-kind={block.kind}
      data-structure-kind={block.structureKind ?? block.kind}
      data-block-count={blocks.length}
      data-block-id={block.id}
      data-group-start={startsGroup}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onClick={(event) => {
        if (event.target instanceof HTMLAnchorElement) return
        focusSource()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") focusSource()
      }}
    >
      {mode === "source" ? source : null}
      {mode === "parallel" ? translation : null}
      {mode === "bilingual" ? (
        <div className="page-translation-bilingual">
          {source}
          {figure ? null : translation}
        </div>
      ) : null}
    </article>
  )
}
