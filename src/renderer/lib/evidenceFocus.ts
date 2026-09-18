import type { EvidenceNavigationTarget } from "../../shared/knowledgeTypes"
import type { Viewport } from "../types"
import { focusSourceRect } from "./viewport"

export function evidenceFocusViewport(
  viewport: Viewport,
  available: { readonly width: number; readonly height: number },
  target: EvidenceNavigationTarget,
): Viewport | null {
  const fragments = target.fragments.filter((item) => item.width > 0 && item.height > 0)
  if (fragments.length === 0) return null
  const x = Math.min(...fragments.map((item) => item.x))
  const y = Math.min(...fragments.map((item) => item.y))
  const right = Math.max(...fragments.map((item) => item.x + item.width))
  const bottom = Math.max(...fragments.map((item) => item.y + item.height))
  return focusSourceRect(viewport, available, { x, y, width: right - x, height: bottom - y })
}
