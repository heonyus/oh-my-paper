import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import type { BlockContent, DefinitionContent, Table as MarkdownTable, RootContent } from "mdast"
import {
  docxChildRuns,
  docxImageRun,
  docxNativeMath,
  ExportMathRendererRequiredError,
  type MathImageRenderer,
} from "./exportDocxRuns"
import { plainExportText } from "./exportSanitize"
import type { ExportSnapshot } from "./exportSnapshot"

function headingLevel(depth: 1 | 2 | 3 | 4 | 5 | 6) {
  switch (depth) {
    case 1:
      return HeadingLevel.HEADING_1
    case 2:
      return HeadingLevel.HEADING_2
    case 3:
      return HeadingLevel.HEADING_3
    case 4:
      return HeadingLevel.HEADING_4
    case 5:
      return HeadingLevel.HEADING_5
    case 6:
      return HeadingLevel.HEADING_6
    default:
      return assertNever(depth)
  }
}

async function markdownTable(
  node: MarkdownTable,
  snapshot: ExportSnapshot,
  renderMath: MathImageRenderer | undefined,
): Promise<Table> {
  const rows = await Promise.all(
    node.children.map(
      async (row, index) =>
        new TableRow({
          tableHeader: index === 0,
          cantSplit: true,
          children: await Promise.all(
            row.children.map(
              async (cell) =>
                new TableCell({
                  ...(index === 0 ? { shading: { fill: "E3EDE5" } } : {}),
                  margins: { top: 100, bottom: 100, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: await docxChildRuns(
                        cell.children,
                        snapshot,
                        renderMath,
                        index === 0 ? { bold: true } : {},
                      ),
                    }),
                  ],
                }),
            ),
          ),
        }),
    ),
  )
  const border = { style: BorderStyle.SINGLE, color: "D9D9D9", size: 4 }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
  })
}

async function block(
  node: BlockContent | DefinitionContent,
  snapshot: ExportSnapshot,
  renderMath: MathImageRenderer | undefined,
): Promise<readonly (Paragraph | Table)[]> {
  switch (node.type) {
    case "paragraph":
      return [
        new Paragraph({
          children: await docxChildRuns(node.children, snapshot, renderMath),
          spacing: { after: 160 },
        }),
      ]
    case "heading":
      return [
        new Paragraph({
          heading: headingLevel(node.depth),
          children: await docxChildRuns(node.children, snapshot, renderMath),
        }),
      ]
    case "blockquote": {
      const children = await Promise.all(
        node.children.map((child) => block(child, snapshot, renderMath)),
      )
      return children.flat()
    }
    case "list":
      return await Promise.all(
        node.children.map(async (item, index) => {
          const text = item.children
            .flatMap((child) =>
              child.type === "paragraph" ? child.children.map(plainExportText) : [],
            )
            .join(" ")
          const prefix = node.ordered ? `${(node.start ?? 1) + index}. ` : "• "
          return new Paragraph({
            children: [new TextRun(`${prefix}${text}`)],
            indent: { left: 360, hanging: 240 },
          })
        }),
      )
    case "code":
      return [
        new Paragraph({
          children: [new TextRun({ text: node.value, font: "Menlo" })],
          spacing: { before: 120, after: 160 },
        }),
      ]
    case "math": {
      const math = docxNativeMath(node.value)
      if (math) return [new Paragraph({ children: [math], alignment: AlignmentType.CENTER })]
      if (!renderMath) throw new ExportMathRendererRequiredError(node.value)
      return [
        new Paragraph({
          children: [docxImageRun(await renderMath(node.value))],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Equation rendered as an image; LaTeX is in its alternative text.",
              italics: true,
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      ]
    }
    case "table":
      return [await markdownTable(node, snapshot, renderMath)]
    case "thematicBreak":
      return [new Paragraph({ text: "────────────────" })]
    case "html":
      return node.value === "<!-- ohmypaper:page-break -->"
        ? [new Paragraph({ children: [new PageBreak()] })]
        : []
    case "definition":
    case "footnoteDefinition":
      return []
    default:
      return assertNever(node)
  }
}

async function rootNode(
  node: RootContent,
  snapshot: ExportSnapshot,
  renderMath: MathImageRenderer | undefined,
): Promise<readonly (Paragraph | Table)[]> {
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
      return await block(node, snapshot, renderMath)
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
      return [new Paragraph({ children: await docxChildRuns([node], snapshot, renderMath) })]
    case "listItem":
    case "tableCell":
    case "tableRow":
    case "yaml":
      return []
    default:
      return assertNever(node)
  }
}

export async function docxContent(
  snapshot: ExportSnapshot,
  renderMath: MathImageRenderer | undefined,
): Promise<readonly (Paragraph | Table)[]> {
  const nested = await Promise.all(
    snapshot.root.children.map((node) => rootNode(node, snapshot, renderMath)),
  )
  return nested.flat()
}

export function docxAppendix(snapshot: ExportSnapshot): readonly Paragraph[] {
  const rows = [
    ...snapshot.bibliography.map(
      (item) => `[${item.key}] ${item.text}${item.url ? ` ${item.url}` : ""}`,
    ),
    ...snapshot.sources.map(
      (item) =>
        `${item.label} — ${item.locator} (${item.availability})${item.url ? ` ${item.url}` : ""}`,
    ),
    ...snapshot.limitations.map((item) => item.detail),
  ]
  return rows.length
    ? [
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Sources and export limitations" }),
        ...rows.map((text) => new Paragraph({ text, bullet: { level: 0 } })),
      ]
    : []
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported DOCX block node: ${JSON.stringify(value)}`)
}
