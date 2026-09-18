import { randomUUID } from "node:crypto"
import { open, rename, writeFile } from "node:fs/promises"
import { basename } from "node:path"
import { dialog, ipcMain } from "electron"
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
import { ipcChannels } from "../shared/ipcChannels"
import { knowledgeNodeSchema, placementRecordSchema } from "../shared/knowledgeSchemas"
import { InterchangePreviewStore } from "./interchangePreviewStore"
import type { InterchangeService } from "./interchangeService"

export function registerInterchangeIpc(service: InterchangeService): () => void {
  const previews = new InterchangePreviewStore()
  ipcMain.handle(ipcChannels.interchangeMarkdownExport, async (_event, value: unknown) => {
    const { nodeId } = interchangeMarkdownExportRequestSchema.parse(value)
    return service.exportNodeToMarkdown(nodeId)
  })

  ipcMain.handle(ipcChannels.interchangeMarkdownImportPreview, async (event, value: unknown) => {
    const { files } = interchangeMarkdownImportPreviewRequestSchema.parse(value)
    const preview = service.previewMarkdownImport(files)
    return markdownImportPreviewSchema.parse({
      ...preview,
      previewId: previews.create(event.sender.id, { kind: "markdown", data: preview }),
    })
  })

  ipcMain.handle(ipcChannels.interchangeMarkdownImportCommit, async (event, value: unknown) => {
    const { previewId } = interchangeMarkdownImportCommitRequestSchema.parse(value)
    const preview = previews.take(event.sender.id, previewId)
    if (preview.kind !== "markdown") throw new Error("잘못된 가져오기 형식입니다.")
    const result = await service.commitMarkdownImport(preview.data.newNodes)
    return z.object({ createdNodes: z.array(knowledgeNodeSchema) }).parse(result)
  })

  ipcMain.handle(ipcChannels.interchangeCanvasExport, async (_event, value: unknown) => {
    const { boardId } = interchangeCanvasExportRequestSchema.parse(value)
    const result = service.exportBoardCanvas(boardId)
    return canvasExportResultSchema.parse(result)
  })

  ipcMain.handle(ipcChannels.interchangeCanvasImportPreview, async (event, value: unknown) => {
    const { canvasJson, sidecarJson } = interchangeCanvasImportPreviewRequestSchema.parse(value)
    const preview = service.previewCanvasImport(canvasJson, sidecarJson)
    return canvasImportPreviewSchema.parse({
      ...preview,
      previewId: previews.create(event.sender.id, { kind: "canvas", data: preview }),
    })
  })

  ipcMain.handle(ipcChannels.interchangeCanvasImportCommit, async (event, value: unknown) => {
    const { previewId, targetBoardId } = interchangeCanvasImportCommitRequestSchema.parse(value)
    const preview = previews.take(event.sender.id, previewId)
    if (preview.kind !== "canvas") throw new Error("잘못된 가져오기 형식입니다.")
    const created = service.commitCanvasImport(preview.data, targetBoardId)
    return z.array(placementRecordSchema).parse(created)
  })

  ipcMain.handle(ipcChannels.interchangeExperimentPreview, async (event, value: unknown) => {
    const { rawLines } = interchangeExperimentPreviewRequestSchema.parse(value)
    const preview = service.previewExperimentJsonl(rawLines)
    return experimentImportPreviewSchema.parse({
      ...preview,
      previewId: previews.create(event.sender.id, { kind: "experiment", data: preview }),
    })
  })

  ipcMain.handle(ipcChannels.interchangeExperimentCommit, async (event, value: unknown) => {
    const { previewId, hypothesisNodeId, targetBoardId } =
      interchangeExperimentCommitRequestSchema.parse(value)
    const preview = previews.take(event.sender.id, previewId)
    if (preview.kind !== "experiment") throw new Error("잘못된 가져오기 형식입니다.")
    return experimentCommitResultSchema.parse(
      service.commitExperimentImport(preview.data.records, {
        ...(hypothesisNodeId ? { hypothesisNodeId } : {}),
        ...(targetBoardId ? { targetBoardId } : {}),
      }),
    )
  })

  ipcMain.handle(ipcChannels.interchangeZoteroFilePreview, async (event, value: unknown) => {
    const { rawJson, libraryKey } = interchangeZoteroFilePreviewRequestSchema.parse(value)
    const preview = service.previewZoteroFileImport(rawJson, [], libraryKey ?? "default")
    return zoteroImportPreviewSchema.parse({
      ...preview,
      previewId: previews.create(event.sender.id, { kind: "zotero", data: preview }),
    })
  })

  ipcMain.handle(ipcChannels.interchangeZoteroFetchPreview, async (event, value: unknown) => {
    const { options, libraryKey } = interchangeZoteroFetchPreviewRequestSchema.parse(value)
    const preview = await service.fetchAndPreviewLocalZotero(options, [], libraryKey ?? "local")
    return zoteroImportPreviewSchema.parse({
      ...preview,
      previewId: previews.create(event.sender.id, { kind: "zotero", data: preview }),
    })
  })

  ipcMain.handle(ipcChannels.interchangeZoteroCommit, async (event, value: unknown) => {
    const { previewId } = interchangeZoteroCommitRequestSchema.parse(value)
    const preview = previews.take(event.sender.id, previewId)
    if (preview.kind !== "zotero") throw new Error("잘못된 가져오기 형식입니다.")
    const result = service.commitZoteroImport(preview.data.items)
    return zoteroCommitResultSchema.parse(result)
  })

  ipcMain.handle(ipcChannels.interchangeChooseFiles, async (_event, value: unknown) => {
    const { filters, multiple } = chooseFilesRequestSchema.parse(value ?? {})
    const res = await dialog.showOpenDialog({
      properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: filters.map((f) => ({ name: f.name, extensions: [...f.extensions] })),
    })
    if (res.canceled || res.filePaths.length === 0) return []
    if (res.filePaths.length > 16) throw new Error("한 번에 16개 파일까지 가져올 수 있습니다.")
    const results: { name: string; content: string }[] = []
    let remaining = 20_000_000
    for (const filePath of res.filePaths) {
      const file = await open(filePath, "r")
      try {
        const info = await file.stat()
        if (!info.isFile() || info.size > 10_000_000 || info.size > remaining)
          throw new Error("파일 크기 제한을 초과했습니다.")
        const bytes = Buffer.alloc(Math.min(10_000_000, remaining) + 1)
        let bytesRead = 0
        while (bytesRead < bytes.length) {
          const chunk = await file.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead)
          if (chunk.bytesRead === 0) break
          bytesRead += chunk.bytesRead
        }
        if (bytesRead > 10_000_000 || bytesRead > remaining)
          throw new Error("파일 크기 제한을 초과했습니다.")
        remaining -= bytesRead
        results.push({
          name: basename(filePath),
          content: bytes.subarray(0, bytesRead).toString("utf8"),
        })
      } finally {
        await file.close()
      }
    }
    return results
  })

  ipcMain.handle(ipcChannels.interchangeSaveFile, async (_event, value: unknown) => {
    const { defaultName, content, filters } = saveFileRequestSchema.parse(value)
    const res = await dialog.showSaveDialog({
      defaultPath: basename(defaultName),
      filters: filters.map((f) => ({ name: f.name, extensions: [...f.extensions] })),
    })
    if (res.canceled || !res.filePath) {
      return { saved: false, filePath: null }
    }
    const temporaryPath = `${res.filePath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" })
    await rename(temporaryPath, res.filePath)
    return { saved: true, filePath: res.filePath }
  })

  return () => {
    ipcMain.removeHandler(ipcChannels.interchangeMarkdownExport)
    ipcMain.removeHandler(ipcChannels.interchangeMarkdownImportPreview)
    ipcMain.removeHandler(ipcChannels.interchangeMarkdownImportCommit)
    ipcMain.removeHandler(ipcChannels.interchangeCanvasExport)
    ipcMain.removeHandler(ipcChannels.interchangeCanvasImportPreview)
    ipcMain.removeHandler(ipcChannels.interchangeCanvasImportCommit)
    ipcMain.removeHandler(ipcChannels.interchangeExperimentPreview)
    ipcMain.removeHandler(ipcChannels.interchangeExperimentCommit)
    ipcMain.removeHandler(ipcChannels.interchangeZoteroFilePreview)
    ipcMain.removeHandler(ipcChannels.interchangeZoteroFetchPreview)
    ipcMain.removeHandler(ipcChannels.interchangeZoteroCommit)
    ipcMain.removeHandler(ipcChannels.interchangeChooseFiles)
    ipcMain.removeHandler(ipcChannels.interchangeSaveFile)
  }
}
