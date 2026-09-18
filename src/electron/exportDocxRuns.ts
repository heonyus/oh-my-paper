import {
  ExternalHyperlink,
  ImageRun,
  MathRun,
  type ParagraphChild,
  TextRun,
  Math as WordMath,
} from "docx"
import type { PhrasingContent } from "mdast"
import { plainExportText } from "./exportSanitize"
import type { ExportSnapshot, ExportSnapshotAsset } from "./exportSnapshot"

export type RenderedMathImage = {
  readonly bytes: Uint8Array
  readonly mediaType: "image/png"
  readonly width: number
  readonly height: number
  readonly altText: string
}

export type MathImageRenderer = (latex: string) => Promise<RenderedMathImage>

export class ExportMathRendererRequiredError extends Error {
  readonly name = "ExportMathRendererRequiredError"
  constructor(readonly latex: string) {
    super(`A rendered fallback is required for unsupported DOCX math: ${latex}`)
  }
}

type RunStyle = { readonly bold?: boolean; readonly italics?: boolean; readonly strike?: boolean }

export function docxImageRun(asset: ExportSnapshotAsset | RenderedMathImage): ImageRun {
  const scale = Math.min(1, 560 / asset.width)
  const type =
    asset.mediaType === "image/jpeg" ? "jpg" : asset.mediaType === "image/gif" ? "gif" : "png"
  return new ImageRun({
    type,
    data: asset.bytes,
    transformation: {
      width: Math.round(asset.width * scale),
      height: Math.round(asset.height * scale),
    },
    altText: { name: asset.altText || "Export image", description: asset.altText },
  })
}

export function docxNativeMath(latex: string): WordMath | null {
  return /^[\p{L}\p{N}\s+*/=().,<>≤≥≠-]+$/u.test(latex)
    ? new WordMath({ children: [new MathRun(latex)] })
    : null
}

async function docxRuns(
  node: PhrasingContent,
  snapshot: ExportSnapshot,
  renderMath: MathImageRenderer | undefined,
  style: RunStyle = {},
): Promise<readonly ParagraphChild[]> {
  switch (node.type) {
    case "text":
      return [new TextRun({ text: node.value, ...style })]
    case "inlineCode":
      return [new TextRun({ text: node.value, font: "Menlo", ...style })]
    case "inlineMath": {
      const math = docxNativeMath(node.value)
      if (math) return [math]
      if (!renderMath) throw new ExportMathRendererRequiredError(node.value)
      return [
        docxImageRun(await renderMath(node.value)),
        new TextRun({
          text: " [Equation rendered as an image; LaTeX is in its alternative text.]",
          italics: true,
        }),
      ]
    }
    case "break":
      return [new TextRun({ break: 1 })]
    case "emphasis":
      return await docxChildRuns(node.children, snapshot, renderMath, { ...style, italics: true })
    case "strong":
      return await docxChildRuns(node.children, snapshot, renderMath, { ...style, bold: true })
    case "delete":
      return await docxChildRuns(node.children, snapshot, renderMath, { ...style, strike: true })
    case "link":
      return [
        new ExternalHyperlink({
          link: node.url,
          children: await docxChildRuns(node.children, snapshot, renderMath, style),
        }),
      ]
    case "image": {
      const name = node.url.startsWith("assets/") ? node.url.slice(7) : ""
      const asset = snapshot.assets.find((item) => item.filename === name)
      return asset ? [docxImageRun(asset)] : [new TextRun(node.alt ?? "[image omitted]")]
    }
    case "html":
      return []
    case "footnoteReference":
    case "imageReference":
    case "linkReference":
      return [new TextRun(plainExportText(node))]
    default:
      return assertNever(node)
  }
}

export async function docxChildRuns(
  children: readonly PhrasingContent[],
  snapshot: ExportSnapshot,
  renderMath: MathImageRenderer | undefined,
  style: RunStyle = {},
): Promise<readonly ParagraphChild[]> {
  const nested = await Promise.all(
    children.map((child) => docxRuns(child, snapshot, renderMath, style)),
  )
  return nested.flat()
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported DOCX inline node: ${JSON.stringify(value)}`)
}
