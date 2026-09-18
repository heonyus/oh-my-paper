import { type IpcRenderer, ipcRenderer } from "electron"
import { type BibliographyApi, bibliographyChannels } from "../shared/bibliographyIpc"
import {
  bibliographyDuplicatePreviewInputSchema,
  bibliographyDuplicatePreviewSchema,
  bibliographyExportInputSchema,
  bibliographyExportResultSchema,
  bibliographyPaperSchema,
  bibliographyUpdateInputSchema,
} from "../shared/bibliographySchemas"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"

type BibliographyRenderer = Pick<IpcRenderer, "invoke">

export function createBibliographyPreload(
  renderer: BibliographyRenderer = ipcRenderer,
): BibliographyApi {
  return {
    getPaper: async (paperNodeId) =>
      bibliographyPaperSchema.parse(
        await renderer.invoke(
          bibliographyChannels.getPaper,
          knowledgeNodeIdSchema.parse(paperNodeId),
        ),
      ),
    updatePaper: async (input) =>
      bibliographyPaperSchema.parse(
        await renderer.invoke(
          bibliographyChannels.updatePaper,
          bibliographyUpdateInputSchema.parse(input),
        ),
      ),
    previewDuplicates: async (input) =>
      bibliographyDuplicatePreviewSchema.parse(
        await renderer.invoke(
          bibliographyChannels.previewDuplicates,
          bibliographyDuplicatePreviewInputSchema.parse(input),
        ),
      ),
    exportBibtex: async (input) =>
      bibliographyExportResultSchema.parse(
        await renderer.invoke(
          bibliographyChannels.exportBibtex,
          bibliographyExportInputSchema.parse(input),
        ),
      ),
  }
}
