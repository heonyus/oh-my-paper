import type { JSX } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

const components: Components = {
  a: ({ children, href }) => {
    if (!href?.startsWith("https://")) return <span>{children}</span>
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault()
          void window.scourgify.openExternal({ url: href })
        }}
      >
        {children}
      </a>
    )
  },
}

function normalizedDisplayMath(source: string): string {
  return source.replace(/\$\$\s*([\s\S]*?)\s*\$\$/gu, (_match, expression: string) => {
    return `$$\n${expression.trim()}\n$$`
  })
}

export function MarkdownContent({
  source,
  className,
}: {
  readonly source: string
  readonly className?: string | undefined
}): JSX.Element {
  return (
    <div className={["markdown-content", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {normalizedDisplayMath(source)}
      </ReactMarkdown>
    </div>
  )
}
