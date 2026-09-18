import { Buffer } from "node:buffer"
import { renderToString } from "katex"
import type {
  BlockContent,
  DefinitionContent,
  ListItem,
  PhrasingContent,
  RootContent,
  TableCell,
} from "mdast"
import type { ExportFile } from "../shared/exportSchemas"
import { exportFileSchema } from "../shared/exportSchemas"
import { exportFilenameBase } from "./exportMarkdown"
import { plainExportText } from "./exportSanitize"
import type { ExportSnapshot } from "./exportSnapshot"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function dataUrl(snapshot: ExportSnapshot, relativePath: string): string | null {
  const filename = relativePath.startsWith("assets/") ? relativePath.slice(7) : ""
  const asset = snapshot.assets.find((item) => item.filename === filename)
  return asset
    ? `data:${asset.mediaType};base64,${Buffer.from(asset.bytes).toString("base64")}`
    : null
}

function mathHtml(latex: string, displayMode: boolean): string {
  return renderToString(latex, {
    displayMode,
    output: "mathml",
    strict: false,
    throwOnError: false,
    trust: false,
  })
}

function inline(node: PhrasingContent, snapshot: ExportSnapshot): string {
  switch (node.type) {
    case "text":
      return escapeHtml(node.value)
    case "inlineCode":
      return `<code>${escapeHtml(node.value)}</code>`
    case "inlineMath":
      return `<span class="math">${mathHtml(node.value, false)}</span>`
    case "break":
      return "<br>"
    case "emphasis":
      return `<em>${node.children.map((child) => inline(child, snapshot)).join("")}</em>`
    case "strong":
      return `<strong>${node.children.map((child) => inline(child, snapshot)).join("")}</strong>`
    case "delete":
      return `<del>${node.children.map((child) => inline(child, snapshot)).join("")}</del>`
    case "link":
      return `<a href="${escapeHtml(node.url)}" rel="noreferrer noopener">${node.children.map((child) => inline(child, snapshot)).join("")}</a>`
    case "image": {
      const source = dataUrl(snapshot, node.url)
      return source
        ? `<img src="${source}" alt="${escapeHtml(node.alt ?? "")}">`
        : escapeHtml(node.alt ?? "[image omitted]")
    }
    case "html":
      return ""
    case "footnoteReference":
    case "imageReference":
    case "linkReference":
      return escapeHtml(plainExportText(node))
    default:
      return assertNever(node)
  }
}

function cellHtml(cell: TableCell, snapshot: ExportSnapshot, header: boolean): string {
  const tag = header ? "th" : "td"
  return `<${tag}>${cell.children.map((child) => inline(child, snapshot)).join("")}</${tag}>`
}

function listItemHtml(item: ListItem, snapshot: ExportSnapshot): string {
  return `<li>${item.children.map((child) => block(child, snapshot)).join("")}</li>`
}

function block(node: BlockContent | DefinitionContent, snapshot: ExportSnapshot): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${node.children.map((child) => inline(child, snapshot)).join("")}</p>`
    case "heading":
      return `<h${node.depth}>${node.children.map((child) => inline(child, snapshot)).join("")}</h${node.depth}>`
    case "blockquote":
      return `<blockquote>${node.children.map((child) => block(child, snapshot)).join("")}</blockquote>`
    case "list": {
      const tag = node.ordered ? "ol" : "ul"
      const start = node.ordered && node.start && node.start !== 1 ? ` start="${node.start}"` : ""
      return `<${tag}${start}>${node.children.map((item) => listItemHtml(item, snapshot)).join("")}</${tag}>`
    }
    case "code":
      return `<pre><code${node.lang ? ` data-language="${escapeHtml(node.lang)}"` : ""}>${escapeHtml(node.value)}</code></pre>`
    case "math":
      return `<div class="math math-display">${mathHtml(node.value, true)}</div>`
    case "table": {
      const rows = node.children.map((row, index) => {
        const cells = row.children.map((cell) => cellHtml(cell, snapshot, index === 0)).join("")
        return `<tr>${cells}</tr>`
      })
      const head = rows[0] ? `<thead>${rows[0]}</thead>` : ""
      const body = rows.length > 1 ? `<tbody>${rows.slice(1).join("")}</tbody>` : ""
      return `<table>${head}${body}</table>`
    }
    case "thematicBreak":
      return "<hr>"
    case "html":
      return node.value === "<!-- scourgify:page-break -->"
        ? '<div class="page-break" aria-hidden="true"></div>'
        : ""
    case "definition":
    case "footnoteDefinition":
      return ""
    default:
      return assertNever(node)
  }
}

function rootContent(node: RootContent, snapshot: ExportSnapshot): string {
  switch (node.type) {
    case "blockquote":
    case "code":
    case "definition":
    case "footnoteDefinition":
    case "heading":
    case "html":
    case "list":
    case "math":
    case "paragraph":
    case "table":
    case "thematicBreak":
      return block(node, snapshot)
    case "break":
    case "delete":
    case "emphasis":
    case "footnoteReference":
    case "image":
    case "imageReference":
    case "inlineCode":
    case "inlineMath":
    case "link":
    case "linkReference":
    case "strong":
    case "text":
      return inline(node, snapshot)
    case "listItem":
    case "tableCell":
    case "tableRow":
    case "yaml":
      return ""
    default:
      return assertNever(node)
  }
}

function referencesHtml(snapshot: ExportSnapshot): string {
  const bibliography = snapshot.bibliography.map((entry) => {
    const text = escapeHtml(`[${entry.key}] ${entry.text}`)
    return `<li>${entry.url ? `<a href="${escapeHtml(entry.url)}" rel="noreferrer noopener">${text}</a>` : text}</li>`
  })
  const sources = snapshot.sources.map((source) => {
    const text = escapeHtml(`${source.label} — ${source.locator} (${source.availability})`)
    return `<li>${source.url ? `<a href="${escapeHtml(source.url)}" rel="noreferrer noopener">${text}</a>` : text}</li>`
  })
  const limitations = snapshot.limitations.map((item) => `<li>${escapeHtml(item.detail)}</li>`)
  return [
    bibliography.length
      ? `<section><h2>Bibliography</h2><ol>${bibliography.join("")}</ol></section>`
      : "",
    sources.length ? `<section><h2>Sources</h2><ul>${sources.join("")}</ul></section>` : "",
    limitations.length
      ? `<section><h2>Export limitations</h2><ul>${limitations.join("")}</ul></section>`
      : "",
  ].join("")
}

const STYLE = `@page{size:A4;margin:18mm}*{box-sizing:border-box}body{max-width:72ch;margin:32px auto;padding:0 20px;color:#17251f;font:14px/1.6 system-ui,-apple-system,sans-serif}h1,h2,h3,h4,h5,h6{break-after:avoid;color:#17251f}a{color:#285644}img{display:block;max-width:100%;height:auto;margin:1rem auto}table{width:100%;border-collapse:collapse;margin:1rem 0}thead{display:table-header-group}th,td{border:1px solid #d6ddd5;padding:.45rem;text-align:left;vertical-align:top}th{background:#e3ede5}pre{overflow-wrap:anywhere;white-space:pre-wrap;background:#ecefea;padding:12px}blockquote{border-left:3px solid #9b772e;margin-left:0;padding-left:1rem}.math{overflow-wrap:anywhere}.math-display{margin:1rem 0;text-align:center;break-inside:avoid}.page-break{break-before:page}@media print{body{max-width:none;margin:0;padding:0}a{color:inherit;text-decoration:none}tr,img,pre{break-inside:avoid}}`

export function buildExportHtml(snapshot: ExportSnapshot): string {
  const content = snapshot.root.children.map((node) => rootContent(node, snapshot)).join("")
  return `<!doctype html><html lang="und"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(snapshot.title)}</title><style>${STYLE}</style></head><body><main><h1>${escapeHtml(snapshot.title)}</h1>${content}${referencesHtml(snapshot)}</main></body></html>`
}

export function exportHtml(snapshot: ExportSnapshot): ExportFile {
  return exportFileSchema.parse({
    relativePath: `${exportFilenameBase(snapshot.title)}.html`,
    mediaType: "text/html",
    bytes: new TextEncoder().encode(buildExportHtml(snapshot)),
  })
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported export node: ${JSON.stringify(value)}`)
}
