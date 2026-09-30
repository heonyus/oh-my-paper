import { type JSX, useMemo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import type { MessageParams } from "../../shared/i18n/locale"
import { parseCitationHref, rehypeSourceCitations, type SourceCitation } from "../lib/chatCitations"
import { useTranslator } from "../lib/locale"
import { type ReaderMessageKey, readerMessages } from "../messages/reader"

type Translate = (key: ReaderMessageKey, params?: MessageParams) => string

function markdownComponents(
  t: Translate,
  onCitation?: (citation: SourceCitation) => void,
): Components {
  return {
    a: ({ children, href }) => {
      const citation = onCitation && href ? parseCitationHref(href) : null
      if (citation && onCitation) {
        return (
          <button
            type="button"
            className="source-citation"
            title={
              citation.quote
                ? t("markdown.citationQuote", { page: citation.page, quote: citation.quote })
                : t("markdown.citationPage", { page: citation.page })
            }
            onClick={() => onCitation(citation)}
          >
            {children}
          </button>
        )
      }
      if (!href?.startsWith("https://")) return <span>{children}</span>
      return (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault()
            void window.ohmypaper.openExternal({ url: href })
          }}
        >
          {children}
        </a>
      )
    },
  }
}

function normalizedDisplayMath(source: string): string {
  return source
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/gu, (_match, expression: string) => {
      return `$$\n${expression.trim()}\n$$`
    })
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/gu, (_match, expression: string) => {
      return `$${expression.trim()}$`
    })
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/gu, (_match, expression: string) => {
      return `$$\n${expression.trim()}\n$$`
    })
}

export function MarkdownContent({
  source,
  className,
  onCitation,
}: {
  readonly source: string
  readonly className?: string | undefined
  /** When set, page citations in the text become chips that call this with the target. */
  readonly onCitation?: ((citation: SourceCitation) => void) | undefined
}): JSX.Element {
  const t = useTranslator(readerMessages)
  const components = useMemo(() => markdownComponents(t, onCitation), [t, onCitation])
  const rehypePlugins = useMemo(
    () => (onCitation ? [rehypeKatex, rehypeSourceCitations] : [rehypeKatex]),
    [onCitation],
  )
  return (
    <div className={["markdown-content", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizedDisplayMath(source)}
      </ReactMarkdown>
    </div>
  )
}
