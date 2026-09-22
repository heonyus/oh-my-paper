import { type JSX, useEffect, useState } from "react"
import type { BibliographyPaper } from "../../../shared/bibliographySchemas"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import { PaperBibliographyPanel } from "./PaperBibliographyPanel"

export function PaperBibliography({
  id,
  onSaved,
}: {
  readonly id: KnowledgeNodeId
  readonly onSaved: () => void
}): JSX.Element | null {
  const api = window.ohmypaper?.bibliography
  const [paper, setPaper] = useState<BibliographyPaper | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setPaper(null)
    setError(null)
    if (api)
      void api
        .getPaper(id)
        .then((value) => {
          if (active) setPaper(value)
        })
        .catch(() => {
          if (active) setError("서지 정보를 불러오지 못했습니다.")
        })
    return () => {
      active = false
    }
  }, [api, id])
  if (!api) return null
  if (error) return <p role="alert">{error}</p>
  if (!paper) return <p role="status">서지 정보를 여는 중…</p>
  return (
    <PaperBibliographyPanel
      paper={paper}
      onSave={async (input) => {
        const updated = await api.updatePaper(input)
        setPaper(updated)
        onSaved()
        return updated
      }}
      onPreviewDuplicates={api.previewDuplicates}
      onExportBibtex={api.exportBibtex}
    />
  )
}
