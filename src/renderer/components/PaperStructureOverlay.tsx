import { type CSSProperties, type JSX, useCallback, useEffect, useRef, useState } from "react"
import type { DetectedStructure } from "../lib/structureDetector"
import { PaperStructureActions } from "./PaperStructureActions"

type PaperStructureOverlayProps = {
  readonly structures: readonly DetectedStructure[]
  readonly pageWidth?: number | undefined
  readonly onTrigger: (structure: DetectedStructure) => void
  readonly onCopy: (structure: DetectedStructure) => Promise<void>
}

type EquationActionSide = "left" | "right"

type StructureRegionStyle = CSSProperties

const labelledObjectActionWidth = 130
const compactObjectActionWidth = 40

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

export function resolveObjectActionSide(
  preferred: EquationActionSide,
  leftSpace: number,
  rightSpace: number,
  compact: boolean,
): EquationActionSide {
  const requiredSpace = compact ? compactObjectActionWidth : labelledObjectActionWidth
  if (preferred === "left" && leftSpace >= requiredSpace) return "left"
  if (preferred === "right" && rightSpace >= requiredSpace) return "right"
  if (preferred === "left" && rightSpace >= requiredSpace) return "right"
  if (preferred === "right" && leftSpace >= requiredSpace) return "left"
  return rightSpace >= leftSpace ? "right" : "left"
}

export function PaperStructureOverlay({
  structures,
  pageWidth = 800,
  onTrigger,
  onCopy,
}: PaperStructureOverlayProps): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const clearTimerRef = useRef<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [equationPlacement, setEquationPlacement] = useState<{
    readonly id: string
    readonly side: EquationActionSide
  } | null>(null)

  const activateStructure = useCallback((id: string | null): void => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    setActiveId(id)
  }, [])

  useEffect(() => {
    const handleMove = (event: PointerEvent): void => {
      const overlay = overlayRef.current
      if (!overlay) return
      const target = event.target instanceof Element ? event.target : null
      const owner = target?.closest<HTMLElement>(".structure-hover-region")
      const activate = (region: HTMLElement): void => {
        const id = region.getAttribute("data-structure-id")
        activateStructure(id)
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
      else if (clearTimerRef.current === null) {
        clearTimerRef.current = window.setTimeout(() => {
          clearTimerRef.current = null
          setActiveId(null)
        }, 280)
      }
    }
    const clear = (): void => activateStructure(null)
    window.addEventListener("pointermove", handleMove, { passive: true })
    window.addEventListener("blur", clear)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("blur", clear)
      if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
    }
  }, [activateStructure])

  return (
    <div ref={overlayRef} className="paper-structure-overlay">
      {structures.map((structure) => {
        const preferredSide =
          structure.bounds.x + structure.bounds.width / 2 < pageWidth / 2 ? "left" : "right"
        const leftSpace = structure.bounds.x
        const rightSpace = pageWidth - structure.bounds.x - structure.bounds.width
        const preferredSpace = preferredSide === "left" ? leftSpace : rightSpace
        const compactActions =
          (structure.kind === "figure" || structure.kind === "table") &&
          (structure.bounds.width < 190 || preferredSpace < labelledObjectActionWidth)
        const objectActionSide = resolveObjectActionSide(
          preferredSide,
          leftSpace,
          rightSpace,
          compactActions,
        )
        const actionSide =
          equationPlacement?.id === structure.id ? equationPlacement.side : preferredSide
        const regionStyle: StructureRegionStyle = {
          left: structure.bounds.x,
          top: structure.bounds.y,
          width: Math.max(24, structure.bounds.width),
          height: Math.max(18, structure.bounds.height),
        }
        return (
          <div
            key={structure.id}
            className="structure-hover-region"
            data-structure-id={structure.id}
            data-kind={structure.kind}
            data-compact-actions={compactActions}
            data-action-side={structure.kind === "equation" ? actionSide : undefined}
            data-object-action-side={
              structure.kind === "figure" || structure.kind === "table"
                ? objectActionSide
                : undefined
            }
            data-active={activeId === structure.id}
            style={regionStyle}
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
            <PaperStructureActions
              structure={structure}
              active={activeId === structure.id}
              onActivate={() => activateStructure(structure.id)}
              onTrigger={onTrigger}
              onCopy={onCopy}
              onCitationClose={() => activateStructure(null)}
            />
          </div>
        )
      })}
    </div>
  )
}
