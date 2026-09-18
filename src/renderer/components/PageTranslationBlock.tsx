import type { JSX } from "react"
import {
  type PageTranslationBlock as Block,
  setPageSourceActive,
} from "../lib/pageTranslationSource"
import { MarkdownContent } from "./MarkdownContent"

export function PageTranslationBlock({
  block,
  page,
  startsGroup,
}: {
  readonly block: Block
  readonly page: number
  readonly startsGroup: boolean
}): JSX.Element {
  function setActive(active: boolean): void {
    setPageSourceActive(page, block.id, active)
  }

  return (
    <article
      className="page-translation-block"
      data-kind={block.kind}
      data-block-id={block.id}
      data-group-start={startsGroup}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      <MarkdownContent source={block.translation} />
    </article>
  )
}
