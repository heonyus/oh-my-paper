import { Document, Packer, Paragraph } from "docx"
import { type ExportFile, exportFileSchema } from "../shared/exportSchemas"
import { docxAppendix, docxContent } from "./exportDocxBlocks"
import type { MathImageRenderer } from "./exportDocxRuns"
import { exportFilenameBase } from "./exportMarkdown"
import type { ExportSnapshot } from "./exportSnapshot"

export type { MathImageRenderer, RenderedMathImage } from "./exportDocxRuns"
export { ExportMathRendererRequiredError } from "./exportDocxRuns"

const DOCX_FONT = {
  ascii: "Apple SD Gothic Neo",
  cs: "Apple SD Gothic Neo",
  eastAsia: "Apple SD Gothic Neo",
  hAnsi: "Apple SD Gothic Neo",
} as const

export async function exportDocx(
  snapshot: ExportSnapshot,
  options: { readonly renderMath?: MathImageRenderer } = {},
): Promise<ExportFile> {
  const document = new Document({
    creator: "oh-my-paper",
    title: snapshot.title,
    styles: {
      default: {
        document: { run: { font: DOCX_FONT } },
        title: { run: { font: DOCX_FONT, color: "000000" } },
        heading1: { run: { font: DOCX_FONT, color: "000000" } },
        heading2: { run: { font: DOCX_FONT, color: "000000" } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
        children: [
          new Paragraph({ heading: "Title", text: snapshot.title }),
          ...(await docxContent(snapshot, options.renderMath)),
          ...docxAppendix(snapshot),
        ],
      },
    ],
  })
  return exportFileSchema.parse({
    relativePath: `${exportFilenameBase(snapshot.title)}.docx`,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: await Packer.toBuffer(document),
  })
}
