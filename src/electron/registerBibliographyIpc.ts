import { ipcMain } from "electron"
import { bibliographyChannels } from "../shared/bibliographyIpc"
import {
  bibliographyDuplicatePreviewInputSchema,
  bibliographyDuplicatePreviewSchema,
  bibliographyExportInputSchema,
  bibliographyExportResultSchema,
  bibliographyPaperSchema,
  bibliographyUpdateInputSchema,
} from "../shared/bibliographySchemas"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"
import type { BibliographyService } from "./bibliographyService"

type BibliographyHandler = (value: unknown) => unknown

interface BibliographyIpc {
  readonly handle: (channel: string, handler: BibliographyHandler) => void
  readonly removeHandler: (channel: string) => void
}

const electronBibliographyIpc: BibliographyIpc = {
  handle: (channel, handler) => {
    ipcMain.handle(channel, (_event, value: unknown) => handler(value))
  },
  removeHandler: (channel) => ipcMain.removeHandler(channel),
}

export function registerBibliographyIpc(
  service: BibliographyService,
  main: BibliographyIpc = electronBibliographyIpc,
): () => void {
  main.handle(bibliographyChannels.getPaper, (value) =>
    bibliographyPaperSchema.parse(service.getPaper(knowledgeNodeIdSchema.parse(value))),
  )
  main.handle(bibliographyChannels.updatePaper, (value) =>
    bibliographyPaperSchema.parse(service.updatePaper(bibliographyUpdateInputSchema.parse(value))),
  )
  main.handle(bibliographyChannels.previewDuplicates, (value) =>
    bibliographyDuplicatePreviewSchema.parse(
      service.previewDuplicates(bibliographyDuplicatePreviewInputSchema.parse(value)),
    ),
  )
  main.handle(bibliographyChannels.exportBibtex, (value) =>
    bibliographyExportResultSchema.parse(
      service.exportBibtex(bibliographyExportInputSchema.parse(value)),
    ),
  )

  return () => {
    for (const channel of Object.values(bibliographyChannels)) main.removeHandler(channel)
  }
}
