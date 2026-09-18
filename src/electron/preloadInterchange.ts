import { ipcRenderer } from "electron"
import { z } from "zod"
import {
  canvasExportResultSchema,
  canvasImportPreviewSchema,
  chooseFilesRequestSchema,
  experimentCommitResultSchema,
  experimentImportPreviewSchema,
  interchangeCanvasExportRequestSchema,
  interchangeCanvasImportCommitRequestSchema,
  interchangeCanvasImportPreviewRequestSchema,
  interchangeExperimentCommitRequestSchema,
  interchangeExperimentPreviewRequestSchema,
  interchangeMarkdownExportRequestSchema,
  interchangeMarkdownImportCommitRequestSchema,
  interchangeMarkdownImportPreviewRequestSchema,
  interchangeZoteroCommitRequestSchema,
  interchangeZoteroFetchPreviewRequestSchema,
  interchangeZoteroFilePreviewRequestSchema,
  markdownImportPreviewSchema,
  saveFileRequestSchema,
  zoteroCommitResultSchema,
  zoteroImportPreviewSchema,
} from "../shared/interchangeIpc"
import type { ScourgifyApi } from "../shared/ipc"
import { ipcChannels } from "../shared/ipcChannels"
import { knowledgeNodeSchema, placementRecordSchema } from "../shared/knowledgeSchemas"

export function createPreloadInterchange(): ScourgifyApi["interchange"] {
  return {
    exportMarkdown: async (nodeId) =>
      z
        .string()
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.interchangeMarkdownExport,
            interchangeMarkdownExportRequestSchema.parse({ nodeId }),
          ),
        ),
    previewMarkdownImport: async (files) =>
      markdownImportPreviewSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeMarkdownImportPreview,
          interchangeMarkdownImportPreviewRequestSchema.parse({ files }),
        ),
      ),
    commitMarkdownImport: async (previewId) =>
      z
        .object({ createdNodes: z.array(knowledgeNodeSchema) })
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.interchangeMarkdownImportCommit,
            interchangeMarkdownImportCommitRequestSchema.parse({ previewId }),
          ),
        ),
    exportCanvas: async (boardId) =>
      canvasExportResultSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeCanvasExport,
          interchangeCanvasExportRequestSchema.parse({ boardId }),
        ),
      ),
    previewCanvasImport: async (canvasJson, sidecarJson) =>
      canvasImportPreviewSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeCanvasImportPreview,
          interchangeCanvasImportPreviewRequestSchema.parse({ canvasJson, sidecarJson }),
        ),
      ),
    commitCanvasImport: async (previewId, targetBoardId) =>
      z
        .array(placementRecordSchema)
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.interchangeCanvasImportCommit,
            interchangeCanvasImportCommitRequestSchema.parse({ previewId, targetBoardId }),
          ),
        ),
    previewExperimentJsonl: async (rawLines) =>
      experimentImportPreviewSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeExperimentPreview,
          interchangeExperimentPreviewRequestSchema.parse({ rawLines }),
        ),
      ),
    previewZoteroFile: async (rawJson, libraryKey) =>
      zoteroImportPreviewSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeZoteroFilePreview,
          interchangeZoteroFilePreviewRequestSchema.parse({ rawJson, libraryKey }),
        ),
      ),
    fetchAndPreviewLocalZotero: async (options, libraryKey) =>
      zoteroImportPreviewSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeZoteroFetchPreview,
          interchangeZoteroFetchPreviewRequestSchema.parse({ options, libraryKey }),
        ),
      ),
    commitZotero: async (previewId) =>
      zoteroCommitResultSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeZoteroCommit,
          interchangeZoteroCommitRequestSchema.parse({ previewId }),
        ),
      ),
    commitExperiment: async (request) =>
      experimentCommitResultSchema.parse(
        await ipcRenderer.invoke(
          ipcChannels.interchangeExperimentCommit,
          interchangeExperimentCommitRequestSchema.parse(request),
        ),
      ),
    chooseFiles: async (request) =>
      z
        .array(z.object({ name: z.string(), content: z.string() }))
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.interchangeChooseFiles,
            chooseFilesRequestSchema.parse(request),
          ),
        ),
    saveFile: async (request) =>
      z
        .object({ saved: z.boolean(), filePath: z.string().nullable() })
        .parse(
          await ipcRenderer.invoke(
            ipcChannels.interchangeSaveFile,
            saveFileRequestSchema.parse(request),
          ),
        ),
  }
}
