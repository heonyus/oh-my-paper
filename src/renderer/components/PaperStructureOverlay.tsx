import { BookOpen, Copy, FunctionSquare, Image, Plus, Sparkles, Table2 } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type { DetectedStructure } from "../lib/structureDetector"

type PaperStructureOverlayProps = {
  readonly structures: readonly DetectedStructure[]
  readonly pageWidth?: number | undefined
  readonly onTrigger: (structure: DetectedStructure) => void
  readonly onCopy: (structure: DetectedStructure) => Promise<void>
}

type EquationActionSide = "left" | "right"

export function resolveEquationActionSide(
  preferred: EquationActionSide,
  leftSpace: number,
  rightSpace: number,
): EquationActionSide {
  const requiredSpace = 34
  if (preferred === "left" && leftSpace >= requiredSpace) return "left"
  if (preferred === "right" && rightSpace >= requiredSpace) return "right"
  return rightSpace >= leftSpace ? "right" : "left"
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

export function PaperStructureOverlay({
  structures,
  pageWidth = 800,
  onTrigger,
  onCopy,
}: PaperStructureOverlayProps): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [equationPlacement, setEquationPlacement] = useState<{
    readonly id: string
    readonly side: EquationActionSide
  } | null>(null)

  useEffect(() => {
    const handleMove = (event: PointerEvent): void => {
      const overlay = overlayRef.current
      if (!overlay) return
      const target = event.target instanceof Element ? event.target : null
      const owner = target?.closest<HTMLElement>(".structure-hover-region")
      const activate = (region: HTMLElement): void => {
        const id = region.getAttribute("data-structure-id")
        setActiveId(id)
        if (!id || region.getAttribute("data-kind") !== "equation") return
        const viewport = region.closest<HTMLElement>(".board-viewport")
        if (!viewport) return
        const regionRect = region.getBoundingClientRect()
        const viewportRect = viewport.getBoundingClientRect()
        const preferred = region.getAttribute("data-action-side") === "right" ? "right" : "left"
        setEquationPlacement({
          id,
          side: resolveEquationActionSide(
            preferred,
            regionRect.left - viewportRect.left,
            viewportRect.right - regionRect.right,
          ),
        })
      }
      if (owner && overlay.contains(owner)) {
        activate(owner)
        return
      }
      const active = Array.from(overlay.querySelectorAll<HTMLElement>(".structure-hover-region"))
        .filter((region) => {
          const rect = region.getBoundingClientRect()
          return (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          )
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect()
          const rightRect = right.getBoundingClientRect()
          return leftRect.width * leftRect.height - rightRect.width * rightRect.height
        })[0]
      if (active) activate(active)
      else setActiveId(null)
    }
    const clear = (): void => setActiveId(null)
    window.addEventListener("pointermove", handleMove, { passive: true })
    window.addEventListener("blur", clear)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("blur", clear)
    }
  }, [])

  return (
    <div ref={overlayRef} className="paper-structure-overlay">
      {structures.map((structure) => {
        const preferredSide =
          structure.bounds.x + structure.bounds.width / 2 < pageWidth / 2 ? "left" : "right"
        const actionSide =
          equationPlacement?.id === structure.id ? equationPlacement.side : preferredSide
        return (
          <div
            key={structure.id}
            className="structure-hover-region"
            data-structure-id={structure.id}
            data-kind={structure.kind}
            data-action-side={structure.kind === "equation" ? actionSide : undefined}
            data-active={activeId === structure.id}
            style={{
              left: structure.bounds.x,
              top: structure.bounds.y,
              width: Math.max(24, structure.bounds.width),
              height: Math.max(18, structure.bounds.height),
            }}
          >
            <svg className="structure-screen-stroke" width="100%" height="100%" aria-hidden="true">
              <rect
                x="0.5"
                y="0.5"
                width="99%"
                height="99%"
                rx="3"
                ry="3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {structure.kind === "section" ? (
              <button
                type="button"
                className="structure-ai-badge section-ai-badge"
                aria-label={`${structure.title} AI 섹션 해설`}
                title="AI 섹션 해설"
                onPointerEnter={() => setActiveId(structure.id)}
                onClick={(event) => {
                  event.stopPropagation()
                  onTrigger(structure)
                }}
              >
                <StructureIcon kind={structure.kind} />
              </button>
            ) : (
              <div className="structure-action-cluster">
                <button
                  type="button"
                  className="structure-ai-badge"
                  aria-label={`${structure.title} ${actionLabel[structure.kind]}`}
                  title={structure.kind === "equation" ? actionLabel[structure.kind] : undefined}
                  onPointerEnter={() => setActiveId(structure.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                    onTrigger(structure)
                  }}
                >
                  <StructureIcon kind={structure.kind} />
                  {structure.kind === "equation" ? null : (
                    <span>{actionLabel[structure.kind]}</span>
                  )}
                </button>
                {activeId === structure.id &&
                (structure.kind === "figure" ||
                  structure.kind === "table" ||
                  structure.kind === "equation") ? (
                  <button
                    type="button"
                    className="structure-copy-badge"
                    aria-label={`${structure.title} 복사`}
                    title={structure.kind === "equation" ? "LaTeX 복사" : undefined}
                    onPointerEnter={() => setActiveId(structure.id)}
                    onClick={(event) => {
                      event.stopPropagation()
                      setCopyingId(structure.id)
                      void onCopy(structure)
                        .then(() => {
                          setCopiedId(structure.id)
                          setTimeout(
                            () =>
                              setCopiedId((current) => (current === structure.id ? null : current)),
                            1500,
                          )
                        })
                        .catch(() => setCopiedId(null))
                        .finally(() => setCopyingId(null))
                    }}
                  >
                    <Copy size={13} aria-hidden="true" />
                    {structure.kind === "equation" ? null : (
                      <span>
                        {copyingId === structure.id
                          ? "복사 중…"
                          : copiedId === structure.id
                            ? "복사됨"
                            : structure.kind === "figure"
                              ? "그림 복사"
                              : "표 복사"}
                      </span>
                    )}
                  </button>
                ) : null}
              </div>
            )}
            {activeId === structure.id && structure.kind === "citation" ? (
              <div
                className="citation-preview-popover"
                role="dialog"
                aria-label="인용 논문 미리보기"
              >
                <strong>{structure.reference?.title ?? structure.title}</strong>
                <span className="citation-preview-secondary">
                  {structure.reference?.authors ?? "인용 논문 메타정보를 확인하려면 클릭하세요."}
                </span>
                {structure.reference?.year ? (
                  <span className="citation-preview-secondary">{structure.reference.year}</span>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onTrigger(structure)
                    setActiveId(null)
                  }}
                >
                  <Plus size={12} /> Smart Citation 카드 만들기
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
