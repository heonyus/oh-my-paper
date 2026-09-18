import type {
  BibliographyDuplicatePreview,
  BibliographyDuplicatePreviewInput,
  BibliographyExportInput,
  BibliographyExportResult,
  BibliographyPaper,
  BibliographyUpdateInput,
} from "./bibliographySchemas"
import type { KnowledgeNodeId } from "./knowledgeTypes"

export const bibliographyChannels = Object.freeze({
  getPaper: "bibliography:paper-get",
  updatePaper: "bibliography:paper-update",
  previewDuplicates: "bibliography:duplicates-preview",
  exportBibtex: "bibliography:bibtex-export",
})

export interface BibliographyApi {
  readonly getPaper: (paperNodeId: KnowledgeNodeId) => Promise<BibliographyPaper>
  readonly updatePaper: (input: BibliographyUpdateInput) => Promise<BibliographyPaper>
  readonly previewDuplicates: (
    input: BibliographyDuplicatePreviewInput,
  ) => Promise<BibliographyDuplicatePreview>
  readonly exportBibtex: (input: BibliographyExportInput) => Promise<BibliographyExportResult>
}
