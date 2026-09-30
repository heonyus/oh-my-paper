import { ArrowUpLeft } from "lucide-react"
import { type JSX, memo } from "react"
import { useTranslator } from "../lib/locale"
import type { PageTranslationMode } from "../lib/pageTranslationMode"
import {
  type PageTranslationBlock as Block,
  focusPageSource,
  setPageSourceActive,
} from "../lib/pageTranslationSource"
import { readerMessages } from "../messages/reader"
import { MarkdownContent } from "./MarkdownContent"
import { PageTranslationFigure } from "./PageTranslationFigure"

function tableRows(source: string): readonly (readonly string[])[] {
  if (typeof DOMParser === "undefined") return []
  const document = new DOMParser().parseFromString(source, "text/html")
  return [...document.querySelectorAll("tr")]
    .map((row) =>
      [...row.querySelectorAll("th, td")].map((cell) => (cell.textContent ?? "").trim()),
    )
    .filter((row) => row.length > 0 && row.some((cell) => cell.length > 0))
}

function TableContent({ source }: { readonly source: string }): JSX.Element {
  const rows = tableRows(source)
  if (rows.length === 0) return <MarkdownContent source={source} />
  const [header, ...body] = rows
  return (
    <div className="page-translation-table-wrap">
      <table>
        <thead>
          <tr>
            {header?.map((cell) => (
              <th key={`header-${cell}`}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row) => (
            <tr key={`row-${row.join("|")}`}>
              {row.map((cell) => (
                <td key={`cell-${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const PageTranslationBlock = memo(function PageTranslationBlock({
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
  const t = useTranslator(readerMessages)
  const blocks = group ?? [block]

  function setActive(active: boolean): void {
    for (const candidate of blocks) setPageSourceActive(page, candidate.id, active)
  }

  function focusSource(): void {
    focusPageSource(page, block.id)
  }

  const sourceText = blocks.map((candidate) => candidate.source).join(" ")
  const translationText = blocks
    .map((candidate) => candidate.translation.trim())
    .filter((text) => text.length > 0)
    .join(" ")
  const renderContent = (text: string): JSX.Element =>
    block.structureKind === "table" ? (
      <TableContent source={text} />
    ) : (
      <MarkdownContent source={text} />
    )
  const figure =
    block.structureKind === "figure" ? <PageTranslationFigure block={block} page={page} /> : null
  const source = figure ?? (
    <button
      type="button"
      className="page-translation-source"
      aria-label={t("translation.toSource")}
      onFocus={focusSource}
      onClick={focusSource}
    >
      {renderContent(sourceText)}
    </button>
  )
  const translation = figure ?? (
    <div className="page-translation-result">
      <button
        type="button"
        className="page-translation-focus-source"
        aria-label={t("translation.toSourcePosition")}
        onClick={(event) => {
          event.stopPropagation()
          focusSource()
        }}
      >
        <ArrowUpLeft size={14} aria-hidden="true" />
      </button>
      {renderContent(translationText)}
    </div>
  )

  return (
    <article
      className="page-translation-block"
      data-kind={block.kind}
      data-structure-kind={block.structureKind ?? block.kind}
      data-block-count={blocks.length}
      data-block-id={block.id}
      data-block-ids={blocks.map((candidate) => candidate.id).join(" ")}
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
          {figure || !translationText ? null : translation}
        </div>
      ) : null}
    </article>
  )
})
