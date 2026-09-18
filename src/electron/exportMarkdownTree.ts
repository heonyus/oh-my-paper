import type {
  BlockContent,
  DefinitionContent,
  PhrasingContent,
  Root,
  RootContent,
  TableCell,
  TableRow,
} from "mdast"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import { unified } from "unified"
import type { ExportAsset, ExportLimitation } from "../shared/exportSchemas"
import {
  addExportLimitation,
  plainExportText,
  safeExportHref,
  sanitizeExportText,
} from "./exportSanitize"

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

function normalizeCanonicalDisplayMath(markdown: string): string {
  return markdown
    .split("\n")
    .flatMap((line) => {
      const match = /^( {0,3})\$\$(.+)\$\$[ \t]*$/.exec(line)
      if (!match) return [line]
      const indent = match[1]
      const value = match[2]
      return [`${indent}$$`, `${indent}${value}`, `${indent}$$`]
    })
    .join("\n")
}

type Context = {
  readonly assets: ReadonlyMap<string, ExportAsset>
  readonly limitations: ExportLimitation[]
}
function phrasing(node: PhrasingContent, context: Context): PhrasingContent | null {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "inlineMath":
      return { type: node.type, value: sanitizeExportText(node.value, context.limitations) }
    case "break":
      return { type: "break" }
    case "emphasis":
    case "strong":
    case "delete":
      return { type: node.type, children: cleanPhrasing(node.children, context) }
    case "link": {
      const children = cleanPhrasing(node.children, context)
      const url = safeExportHref(node.url)
      if (url) return { type: "link", url, title: null, children }
      addExportLimitation(context.limitations, {
        code: "unsafe_link_removed",
        detail: "A non-portable or unsafe Markdown link target was removed.",
      })
      return { type: "text", value: children.map(plainExportText).join("") }
    }
    case "image": {
      const asset = context.assets.get(node.url)
      if (asset) {
        return { type: "image", url: `assets/${asset.filename}`, title: null, alt: asset.altText }
      }
      addExportLimitation(context.limitations, {
        code: "missing_asset",
        detail: "An image was omitted because no selected in-memory asset matched it.",
      })
      return { type: "text", value: node.alt || "[image omitted]" }
    }
    case "html":
      addExportLimitation(context.limitations, {
        code: "unsupported_html_removed",
        detail: "Raw HTML was removed from the portable export.",
      })
      return null
    case "footnoteReference":
    case "imageReference":
    case "linkReference":
      addExportLimitation(context.limitations, {
        code: "unsupported_markdown_removed",
        detail: `Reference-style Markdown node ${node.type} was flattened or omitted.`,
      })
      return "children" in node
        ? { type: "text", value: node.children.map(plainExportText).join("") }
        : { type: "text", value: "alt" in node ? (node.alt ?? node.identifier) : node.identifier }
    default:
      return assertNever(node)
  }
}

function cleanPhrasing(children: readonly PhrasingContent[], context: Context): PhrasingContent[] {
  return children.flatMap((child) => {
    const clean = phrasing(child, context)
    return clean ? [clean] : []
  })
}

function row(node: TableRow, context: Context): TableRow {
  return {
    type: "tableRow",
    children: node.children.map(
      (cell): TableCell => ({ type: "tableCell", children: cleanPhrasing(cell.children, context) }),
    ),
  }
}

function block(
  node: BlockContent | DefinitionContent,
  context: Context,
): BlockContent | DefinitionContent | null {
  switch (node.type) {
    case "paragraph":
      return { type: "paragraph", children: cleanPhrasing(node.children, context) }
    case "heading":
      return { type: "heading", depth: node.depth, children: cleanPhrasing(node.children, context) }
    case "blockquote":
      return {
        type: "blockquote",
        children: node.children.flatMap((child) => {
          const clean = block(child, context)
          return clean ? [clean] : []
        }),
      }
    case "list":
      return {
        type: "list",
        ordered: node.ordered,
        start: node.start,
        spread: node.spread,
        children: node.children.map((item) => ({
          type: "listItem",
          checked: item.checked,
          spread: item.spread,
          children: item.children.flatMap((child) => {
            const clean = block(child, context)
            return clean ? [clean] : []
          }),
        })),
      }
    case "code": {
      const value = sanitizeExportText(node.value, context.limitations)
      return node.lang ? { type: "code", value, lang: node.lang } : { type: "code", value }
    }
    case "math":
      return { type: "math", value: sanitizeExportText(node.value, context.limitations) }
    case "table":
      return {
        type: "table",
        align: node.align ? [...node.align] : null,
        children: node.children.map((item) => row(item, context)),
      }
    case "thematicBreak":
      return { type: "thematicBreak" }
    case "html":
      if (node.value.trim() === "<!-- scourgify:page-break -->") {
        return { type: "html", value: node.value.trim() }
      }
      addExportLimitation(context.limitations, {
        code: "unsupported_html_removed",
        detail: "Raw HTML was removed from the portable export.",
      })
      return null
    case "definition":
    case "footnoteDefinition":
      addExportLimitation(context.limitations, {
        code: "unsupported_markdown_removed",
        detail: `Markdown node ${node.type} was omitted.`,
      })
      return null
    default:
      return assertNever(node)
  }
}

function rootNode(node: RootContent, context: Context): RootContent | null {
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
      return block(node, context)
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
      return phrasing(node, context)
    case "listItem":
    case "tableCell":
    case "tableRow":
    case "yaml":
      addExportLimitation(context.limitations, {
        code: "unsupported_markdown_removed",
        detail: `Out-of-context Markdown node ${node.type} was omitted.`,
      })
      return null
    default:
      return assertNever(node)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Markdown node: ${JSON.stringify(value)}`)
}

export function sanitizeExportMarkdown(
  markdown: string,
  assets: readonly ExportAsset[],
  limitations: ExportLimitation[],
): Root {
  const context: Context = {
    assets: new Map(assets.map((asset) => [asset.source, asset])),
    limitations,
  }
  return {
    type: "root",
    children: processor.parse(normalizeCanonicalDisplayMath(markdown)).children.flatMap((node) => {
      const clean = rootNode(node, context)
      return clean ? [clean] : []
    }),
  }
}
