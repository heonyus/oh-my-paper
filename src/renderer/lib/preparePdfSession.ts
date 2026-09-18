import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { SourceDocumentAst } from "../../shared/documentAst"
import type { DocumentKind } from "../../shared/schemas"
import { outlineFromAst, pageTextsFromAst, preparedSummaryFromAst } from "./documentAstProjection"
import { cachedPdfDocumentAnalysis } from "./pdfAnalysisCache"
import { buildCitationIndex } from "./pdfCitationIndex"
import { analyzePdfDocument } from "./pdfDocumentFeatures"
import { extractPdfOutline } from "./pdfOutline"
import { extractReferencesFromText } from "./structureDetector"

export async function preparePdfView(
  documentId: string,
  title: string,
  kind: DocumentKind,
  pdf: PDFDocumentProxy,
  ast: SourceDocumentAst | null,
) {
  if (ast) {
    const pageTexts = pageTextsFromAst(ast)
    const bibliography = extractReferencesFromText(pageTexts.join("\n"))
    return {
      summary: {
        ...preparedSummaryFromAst(ast, { title, kind }),
        citations: buildCitationIndex(bibliography, pageTexts),
      },
      bibliography,
      pageTexts,
      outline: outlineFromAst(ast),
    }
  }
  const analysis = await cachedPdfDocumentAnalysis(documentId, () => analyzePdfDocument(pdf, title))
  return { ...analysis, outline: await extractPdfOutline(pdf) }
}
