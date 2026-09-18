import { type RefObject, useCallback, useRef } from "react"
import type { Viewport } from "../types"
import type { ViewportConstraint } from "./boardNavigation"

const identityConstraint: ViewportConstraint = (viewport) => viewport

export function usePanConstraint(): {
  readonly constraintRef: RefObject<ViewportConstraint>
  readonly constrain: ViewportConstraint
} {
  const constraintRef = useRef<ViewportConstraint>(identityConstraint)
  const constrain = useCallback((viewport: Viewport) => constraintRef.current(viewport), [])
  return { constraintRef, constrain }
}
