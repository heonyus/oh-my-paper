import { randomUUID } from "node:crypto"
import { basename } from "node:path"
import { dialog } from "electron"
import type { ImportResult } from "../shared/ipc"
import { importProgressSchema, ipcChannels } from "../shared/ipc"
import type { DocumentId } from "../shared/schemas"
import { DocumentImportError, importDocument } from "./documentService"
import type { WorkspaceStore } from "./workspaceStore"

type AnalysisScheduler = {
  readonly schedule: (documentId: DocumentId) => Promise<void>
}
type ImportEvent = {
  readonly sender: { readonly send: (channel: string, value: unknown) => void }
}

type SuccessfulImport = Exclude<ImportResult, null>

const maxConcurrentImports = 2
let activeImports = 0
const waitingImports: Array<() => void> = []

async function withImportSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeImports >= maxConcurrentImports) {
    await new Promise<void>((resolve) => waitingImports.push(resolve))
  }
  activeImports += 1
  try {
    return await run()
  } finally {
    activeImports -= 1
    waitingImports.shift()?.()
  }
}

function importFailureMessage(error: unknown): string {
  if (!(error instanceof DocumentImportError)) return "파일을 읽지 못했습니다"
  if (error.kind === "password_required") return "암호가 설정된 PDF입니다"
  if (error.kind === "invalid_pdf") return "올바른 PDF 파일이 아닙니다"
  return "파일을 읽지 못했습니다"
}

function emitImportProgress(
  event: ImportEvent,
  progress: Parameters<typeof importProgressSchema.parse>[0],
): void {
  event.sender.send(ipcChannels.importProgress, importProgressSchema.parse(progress))
}

export async function importFromPath(
  event: ImportEvent,
  sourcePath: string,
  analysis: AnalysisScheduler,
  store: WorkspaceStore,
): Promise<ImportResult> {
  return withImportSlot(async () => {
    const jobId = randomUUID()
    const fileName = basename(sourcePath)
    const progress = (
      stage: "checking" | "extracting" | "layout" | "complete",
      state: "active" | "complete" | "warning" | "failed",
      value: number,
      message: string,
    ): void =>
      emitImportProgress(event, { id: jobId, fileName, stage, state, progress: value, message })
    progress("checking", "active", 0, "PDF 확인 중")
    try {
      progress("extracting", "active", 0.2, "텍스트와 메타데이터 추출 중")
      const imported = await importDocument(sourcePath, store)
      if (!imported) return imported
      try {
        await analysis.schedule(imported.document.id)
        progress("complete", "complete", 1, "라이브러리에 추가됨")
      } catch {
        progress("complete", "warning", 1, "PDF 등록 완료 · 로컬 분석 대기")
      }
      return imported
    } catch (error) {
      progress("complete", "failed", 1, importFailureMessage(error))
      throw error
    }
  })
}

export async function importPaths(
  event: ImportEvent,
  paths: readonly string[],
  analysis: AnalysisScheduler,
  store: WorkspaceStore,
): Promise<readonly SuccessfulImport[]> {
  const results = await Promise.all(
    paths.map(async (sourcePath) => {
      try {
        return await importFromPath(event, sourcePath, analysis, store)
      } catch {
        return null
      }
    }),
  )
  return results.filter((result): result is SuccessfulImport => result !== null)
}

export async function chooseAndImport(
  event: ImportEvent,
  analysis: AnalysisScheduler,
  store: WorkspaceStore,
): Promise<ImportResult> {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  })
  const sourcePath = result.filePaths[0]
  if (result.canceled || !sourcePath) return null
  return importFromPath(event, sourcePath, analysis, store)
}
