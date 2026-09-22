import type { JSX } from "react"
import ReactMarkdown, { type Components, defaultUrlTransform } from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import type { KnowledgeNode, KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import { resolveWikiLinks } from "../../lib/knowledgeLinks"
import { safeNoteImageSource } from "./noteRichContent"
import "./notePreview.css"

const WIKI_URL_PREFIX = "ohmypaper-wiki:"
const BLOCK_MARKER = /^<!-- ohmypaper:block:[a-f0-9-]{36} -->\s*$/gmu
const WIKI_LINK = /\[\[([^\]]+)\]\]/gu

export interface NotePreviewProps {
  readonly source: string
  readonly nodes: readonly KnowledgeNode[]
  readonly onNodeSelect: (nodeId: KnowledgeNodeId) => void
}

export function NotePreview({ source, nodes, onNodeSelect }: NotePreviewProps): JSX.Element {
  const visibleSource = source.replace(BLOCK_MARKER, "")
  const links = resolveWikiLinks(visibleSource, nodes)
  let linkIndex = 0
  const markdown = visibleSource.replace(WIKI_LINK, (raw) => {
    const index = linkIndex
    const link = links[index]
    linkIndex += 1
    if (!link) return raw
    const label = (link.label || link.inner).replace(/([\\[\]])/gu, "\\$1")
    return `[${label}](${WIKI_URL_PREFIX}${index})`
  })
  const components: Components = {
    a: ({ children, href }) => {
      if (href?.startsWith(WIKI_URL_PREFIX)) {
        const index = Number(href.slice(WIKI_URL_PREFIX.length))
        const link = Number.isSafeInteger(index) ? links[index] : undefined
        if (!link) return <span>{children}</span>
        const targetId = link.targetId
        return (
          <button
            type="button"
            className="knowledge-link"
            data-status={link.status}
            disabled={!targetId}
            title={targetId ? "지식 항목 열기" : "해결되지 않은 링크"}
            onClick={() => {
              if (targetId) onNodeSelect(targetId)
            }}
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
    img: ({ alt, src }) =>
      src ? (
        <img src={src} alt={alt ?? ""} loading="lazy" />
      ) : (
        <span className="note-preview-blocked-image">{alt || "허용되지 않은 이미지"}</span>
      ),
  }

  return (
    <div className="markdown-content note-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
        skipHtml
        urlTransform={(url, key) => {
          if (key === "src") return safeNoteImageSource(url)
          return url.startsWith(WIKI_URL_PREFIX) ? url : defaultUrlTransform(url)
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
