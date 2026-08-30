import { ListTree, PanelLeftClose } from "lucide-react"
import type { JSX } from "react"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import { SidebarResizeHandle } from "./SidebarResizeHandle"

type OutlinePanelProps = {
  readonly currentPage: number
  readonly outline: readonly PdfOutlineEntry[]
  readonly onJump: (page: number) => void
  readonly onClose: () => void
  readonly width?: number | undefined
  readonly onWidthChange?: ((width: number) => void) | undefined
}

export function OutlinePanel({
  currentPage,
  outline,
  onJump,
  onClose,
  width = 240,
  onWidthChange,
}: OutlinePanelProps): JSX.Element {
  return (
    <aside className="outline-panel" aria-label="논문 목차" style={{ width }}>
      {onWidthChange ? (
        <SidebarResizeHandle
          label="목차 너비 조절"
          width={width}
          minimum={200}
          maximum={420}
          edge="end"
          onWidthChange={onWidthChange}
        />
      ) : null}
      <header>
        <h2>
          <ListTree size={16} aria-hidden="true" /> 목차
        </h2>
        <button type="button" onClick={onClose} aria-label="목차 닫기">
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
      </header>
      {outline.length > 0 ? (
        <ol>
          {outline.map((entry) => (
            <li key={`${entry.page}-${entry.title}`}>
              <button
                type="button"
                aria-current={entry.page === currentPage ? "page" : undefined}
                onClick={() => onJump(entry.page)}
              >
                <span>{entry.title}</span>
                <span>p.{entry.page}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>목차 정보가 없습니다</p>
      )}
    </aside>
  )
}
