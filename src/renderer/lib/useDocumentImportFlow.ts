import { useCallback, useEffect, useState } from "react"
import type { ImportProgress, ImportResult } from "../../shared/ipc"
import type { DocumentRecord, Workspace } from "../../shared/schemas"
import { normalizeWorkspaceTranslations } from "./cardPresentation"

type ImportedDocument = Exclude<ImportResult, null>

export function useDocumentImportFlow({
  onStart,
  onImported,
}: {
  readonly onStart: () => void
  readonly onImported: (workspace: Workspace, document: DocumentRecord) => void
}) {
  const [progress, setProgress] = useState<readonly ImportProgress[]>([])

  useEffect(
    () =>
      window.scourgify.onImportProgress((update) => {
        setProgress((current) => [...current.filter((item) => item.id !== update.id), update])
      }),
    [],
  )

  const finish = useCallback(
    async (result: ImportedDocument): Promise<void> => {
      const current = normalizeWorkspaceTranslations(await window.scourgify.readWorkspace())
      onImported({ ...current, activeDocumentId: result.document.id }, result.document)
      setProgress([])
    },
    [onImported],
  )

  const importPdf = useCallback(async (): Promise<void> => {
    setProgress([])
    onStart()
    try {
      const result = await window.scourgify.importDocument()
      if (result) await finish(result)
    } catch {
      return
    }
  }, [finish, onStart])

  const importDroppedPdfs = useCallback(
    async (files: readonly File[]): Promise<void> => {
      setProgress([])
      onStart()
      const paths = files
        .map((file) => window.scourgify.getDroppedFilePath(file))
        .filter((path) => path.length > 0)
      try {
        const results = await window.scourgify.importDocumentPaths(paths)
        const imported = results.filter((result): result is ImportedDocument => result !== null)
        const last = imported.at(-1)
        if (last) await finish(last)
      } catch {
        return
      }
    },
    [finish, onStart],
  )

  return { progress, importPdf, importDroppedPdfs }
}
