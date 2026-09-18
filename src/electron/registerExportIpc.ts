import { randomUUID } from "node:crypto"
import { link, mkdir, unlink, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative } from "node:path"
import { dialog, ipcMain } from "electron"
import type { ExportApi, ExportFormat, ExportSaveRequest } from "../shared/exportIpc"
import {
  exportChannels,
  exportPreviewRequestSchema,
  exportPreviewSchema,
  exportSaveRequestSchema,
  exportSaveResultSchema,
} from "../shared/exportIpc"
import type { ExportBundle } from "../shared/exportSchemas"

type ExportIpcService = Pick<ExportApi, "preview"> & {
  readonly render: (request: ExportSaveRequest) => Promise<ExportBundle>
}

const extensions: Record<ExportFormat, string> = {
  markdown: "md",
  html: "html",
  docx: "docx",
  pdf: "pdf",
}

async function writeBundle(bundle: ExportBundle, selectedPath: string): Promise<void> {
  const primary = bundle.files[0]
  if (!primary) throw new Error("내보낼 파일이 없습니다.")
  const root = dirname(selectedPath)
  const targets = bundle.files.map((file) => ({
    file,
    path: file === primary ? selectedPath : join(root, file.relativePath),
  }))
  for (const target of targets) {
    const escaped = relative(root, target.path)
    if (escaped.startsWith("..") || escaped.includes("\0"))
      throw new Error("내보내기 경로가 안전하지 않습니다.")
  }
  if (new Set(targets.map((target) => target.path)).size !== targets.length) {
    throw new Error("내보내기 파일 경로가 중복되었습니다.")
  }
  const temporary = targets.map(({ file, path }) => ({
    file,
    path,
    temporary: `${path}.${randomUUID()}.tmp`,
  }))
  const committed: string[] = []
  let operationError: unknown = null
  try {
    for (const target of temporary) {
      await mkdir(dirname(target.path), { recursive: true })
      await writeFile(target.temporary, target.file.bytes, { flag: "wx", mode: 0o600 })
    }
    for (const target of temporary) {
      await link(target.temporary, target.path)
      committed.push(target.path)
      await unlink(target.temporary)
    }
  } catch (error) {
    operationError = error
  }
  const cleanupErrors: unknown[] = []
  for (const path of operationError ? committed.reverse() : []) {
    try {
      await unlink(path)
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        cleanupErrors.push(error)
    }
  }
  for (const target of temporary) {
    try {
      await unlink(target.temporary)
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        cleanupErrors.push(error)
    }
  }
  if (operationError && cleanupErrors.length) {
    throw new AggregateError(
      [operationError, ...cleanupErrors],
      "Export failed and cleanup was incomplete",
    )
  }
  if (operationError) throw operationError
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Export cleanup was incomplete")
  }
}

export function registerExportIpc(service: ExportIpcService): () => void {
  ipcMain.handle(exportChannels.preview, async (_event, value: unknown) => {
    const request = exportPreviewRequestSchema.parse(value)
    return exportPreviewSchema.parse(await service.preview(request.nodeId))
  })
  ipcMain.handle(exportChannels.save, async (_event, value: unknown) => {
    const request = exportSaveRequestSchema.parse(value)
    const bundle = await service.render(request)
    const primary = bundle.files[0]
    if (!primary) throw new Error("내보낼 파일이 없습니다.")
    const result = await dialog.showSaveDialog({
      defaultPath: basename(primary.relativePath),
      filters: [{ name: request.format.toUpperCase(), extensions: [extensions[request.format]] }],
    })
    if (result.canceled || !result.filePath) return { saved: false, fileName: null }
    await writeBundle(bundle, result.filePath)
    return exportSaveResultSchema.parse({ saved: true, fileName: basename(result.filePath) })
  })
  return () => {
    ipcMain.removeHandler(exportChannels.preview)
    ipcMain.removeHandler(exportChannels.save)
  }
}
