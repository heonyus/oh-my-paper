import { BookmarkPlus, BookOpen, Copy, FunctionSquare, Image, Sparkles, Table2 } from "lucide-react"
import { type JSX, useState } from "react"
import type { DetectedStructure } from "../lib/structureDetector"

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
  section: "AI 섹션 해설",
  figure: "AI 그림 해설",
  table: "AI 표 분석",
  equation: "AI 수식 해설",
  citation: "인용 논문 보기",
} as const

export function PaperStructureActions({
  structure,
  active,
  onActivate,
  onTrigger,
  onCopy,
  onCitationClose,
}: PaperStructureActionsProps): JSX.Element | null {
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  if (structure.kind === "citation") {
    return (
      <>
        <button
          type="button"
          className="citation-focus-trigger"
          aria-label={`${structure.title} 인용 논문 미리보기 열기`}
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
          <div className="citation-preview-popover" role="dialog" aria-label="인용 논문 미리보기">
            <div className="citation-preview-heading">
              <BookOpen size={14} aria-hidden="true" />
              <strong>{structure.reference?.title ?? structure.title}</strong>
            </div>
            <span className="citation-preview-secondary">
              {structure.reference?.authors ?? "메타정보 없음"}
            </span>
            {structure.reference?.year ? (
              <span className="citation-preview-secondary">{structure.reference.year}</span>
            ) : null}
            <button
              type="button"
              aria-label="인용 논문 카드를 보드에 저장"
              onBlur={onCitationClose}
              onClick={(event) => {
                event.stopPropagation()
                onTrigger(structure)
                onCitationClose()
              }}
            >
              <BookmarkPlus size={13} aria-hidden="true" /> 보드에 저장
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
        aria-label={`${structure.title} AI 섹션 해설`}
        title="AI 섹션 해설"
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
      ? "그림 복사"
      : structure.kind === "table"
        ? "표 복사"
        : structure.kind === "equation"
          ? "LaTeX 복사"
          : undefined
  return (
    <div className="structure-action-cluster">
      <button
        type="button"
        className="structure-ai-badge"
        aria-label={`${structure.title} ${actionLabel[structure.kind]}`}
        title={actionLabel[structure.kind]}
        onPointerEnter={onActivate}
        onClick={(event) => {
          event.stopPropagation()
          onTrigger(structure)
        }}
      >
        <StructureIcon kind={structure.kind} />
        {structure.kind === "equation" ? null : <span>{actionLabel[structure.kind]}</span>}
      </button>
      {active && copyable ? (
        <button
          type="button"
          className="structure-copy-badge"
          aria-label={`${structure.title} 복사`}
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
                ? "복사 중…"
                : copied
                  ? "복사됨"
                  : structure.kind === "figure"
                    ? "그림 복사"
                    : "표 복사"}
            </span>
          )}
        </button>
      ) : null}
    </div>
  )
}
