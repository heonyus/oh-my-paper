import { ListTree, PanelLeftClose } from "lucide-react"
import type { JSX } from "react"
import { useTranslator } from "../lib/locale"
import type { PdfOutlineEntry } from "../lib/pdfOutline"
import { chromeMessages } from "../messages/chrome"
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
  const t = useTranslator(chromeMessages)
  return (
    <aside className="outline-panel" aria-label={t("outline.label")} style={{ width }}>
      {onWidthChange ? (
        <SidebarResizeHandle
          label={t("outline.resize")}
          width={width}
          minimum={200}
          maximum={420}
          edge="end"
          onWidthChange={onWidthChange}
        />
      ) : null}
      <header>
        <h2>
          <ListTree size={16} aria-hidden="true" /> {t("outline.title")}
        </h2>
        <button type="button" onClick={onClose} aria-label={t("outline.close")}>
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
        <p>{t("outline.empty")}</p>
      )}
    </aside>
  )
}
