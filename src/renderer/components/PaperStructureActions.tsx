import { BookmarkPlus, BookOpen, Copy, FunctionSquare, Image, Sparkles, Table2 } from "lucide-react"
import { type JSX, useState } from "react"
import { useTranslator } from "../lib/locale"
import type { DetectedStructure } from "../lib/structureDetector"
import { type ReaderMessageKey, readerMessages } from "../messages/reader"

type PaperStructureActionsProps = {
  readonly structure: DetectedStructure
  readonly active: boolean
  readonly onActivate: () => void
  readonly onTrigger: (structure: DetectedStructure) => void
  readonly onCopy: (structure: DetectedStructure) => Promise<void>
  readonly onCitationClose: () => void
}

function StructureIcon({ kind }: { readonly kind: DetectedStructure["kind"] }): JSX.Element {
  switch (kind) {
    case "section":
      return <Sparkles size={13} aria-hidden="true" />
    case "figure":
      return <Image size={13} aria-hidden="true" />
    case "table":
      return <Table2 size={13} aria-hidden="true" />
    case "equation":
      return <FunctionSquare size={13} aria-hidden="true" />
    case "citation":
      return <BookOpen size={13} aria-hidden="true" />
  }
}

const actionLabel = {
  section: "structure.section",
  figure: "structure.figure",
  table: "structure.table",
  equation: "structure.equation",
  citation: "structure.citation",
} as const satisfies Readonly<Record<DetectedStructure["kind"], ReaderMessageKey>>

export function PaperStructureActions({
  structure,
  active,
  onActivate,
  onTrigger,
  onCopy,
  onCitationClose,
}: PaperStructureActionsProps): JSX.Element | null {
  const t = useTranslator(readerMessages)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  if (structure.kind === "citation") {
    return (
      <>
        <button
          type="button"
          className="citation-focus-trigger"
          aria-label={t("structure.citationPreviewOpen", { title: structure.title })}
          onFocus={onActivate}
          onBlur={(event) => {
            if (
              !(event.relatedTarget instanceof Element) ||
              !event.relatedTarget.closest(".citation-preview-popover")
            )
              onCitationClose()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onActivate()
          }}
        >
          {structure.title}
        </button>
        {active ? (
          <div
            className="citation-preview-popover"
            role="dialog"
            aria-label={t("structure.citationPreview")}
          >
            <div className="citation-preview-heading">
              <BookOpen size={14} aria-hidden="true" />
              <strong>{structure.reference?.title ?? structure.title}</strong>
            </div>
            <span className="citation-preview-secondary">
              {structure.reference?.authors ?? t("structure.noMetadata")}
            </span>
            {structure.reference?.year ? (
              <span className="citation-preview-secondary">{structure.reference.year}</span>
            ) : null}
            <button
              type="button"
              aria-label={t("structure.saveCitationLabel")}
              onBlur={onCitationClose}
              onClick={(event) => {
                event.stopPropagation()
                onTrigger(structure)
                onCitationClose()
              }}
            >
              <BookmarkPlus size={13} aria-hidden="true" /> {t("structure.saveCitation")}
            </button>
          </div>
        ) : null}
      </>
    )
  }
  if (structure.kind === "section") {
    return (
      <button
        type="button"
        className="structure-ai-badge section-ai-badge"
        aria-label={t("structure.actionOn", {
          title: structure.title,
          action: t("structure.section"),
        })}
        title={t("structure.section")}
        onPointerEnter={onActivate}
        onClick={(event) => {
          event.stopPropagation()
          onTrigger(structure)
        }}
      >
        <StructureIcon kind={structure.kind} />
      </button>
    )
  }
  const copyable =
    structure.kind === "figure" || structure.kind === "table" || structure.kind === "equation"
  const copyTitle =
    structure.kind === "figure"
      ? t("structure.copyFigure")
      : structure.kind === "table"
        ? t("structure.copyTable")
        : structure.kind === "equation"
          ? t("structure.copyLatex")
          : undefined
  const action = t(actionLabel[structure.kind])
  return (
    <div className="structure-action-cluster">
      <button
        type="button"
        className="structure-ai-badge"
        aria-label={t("structure.actionOn", { title: structure.title, action })}
        title={action}
        onPointerEnter={onActivate}
        onClick={(event) => {
          event.stopPropagation()
          onTrigger(structure)
        }}
      >
        <StructureIcon kind={structure.kind} />
        {structure.kind === "equation" ? null : <span>{action}</span>}
      </button>
      {active && copyable ? (
        <button
          type="button"
          className="structure-copy-badge"
          aria-label={t("structure.copyLabel", { title: structure.title })}
          title={copyTitle}
          onPointerEnter={onActivate}
          onClick={(event) => {
            event.stopPropagation()
            setCopying(true)
            void onCopy(structure)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
              .catch(() => setCopied(false))
              .finally(() => setCopying(false))
          }}
        >
          <Copy size={13} aria-hidden="true" />
          {structure.kind === "equation" ? null : (
            <span>
              {copying
                ? t("structure.copying")
                : copied
                  ? t("structure.copied")
                  : structure.kind === "figure"
                    ? t("structure.copyFigure")
                    : t("structure.copyTable")}
            </span>
          )}
        </button>
      ) : null}
    </div>
  )
}
