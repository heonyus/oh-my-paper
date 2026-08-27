import { FilePlus2, X } from "lucide-react"
import type { JSX } from "react"
import type { DocumentId, DocumentRecord } from "../types"

type LibraryPanelProps = {
  readonly documents: readonly DocumentRecord[]
  readonly activeId: DocumentId | null
  readonly onSelect: (id: DocumentId) => void
  readonly onImport: () => void
  readonly onClose: () => void
}

export function LibraryPanel({
  documents,
  activeId,
  onSelect,
  onImport,
  onClose,
}: LibraryPanelProps): JSX.Element {
  return (
    <aside className="library-panel" aria-label="논문 라이브러리">
      <header>
        <h2>논문 라이브러리</h2>
        <button type="button" aria-label="라이브러리 닫기" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <button type="button" className="primary-action" onClick={onImport}>
        <FilePlus2 size={15} /> PDF 가져오기
      </button>
      <ul>
        {documents.map((document) => (
          <li key={document.id}>
            <button
              type="button"
              data-active={document.id === activeId}
              onClick={() => onSelect(document.id)}
            >
              <strong>{document.title}</strong>
              <span>{document.pageCount}페이지</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
