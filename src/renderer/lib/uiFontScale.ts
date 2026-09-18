import type { CSSProperties } from "react"
import type { UiFontFamily } from "../../shared/schemas"
import { uiFontFamilyStack } from "../../shared/uiAppearance"

export type AppShellStyle = CSSProperties & {
  readonly "--type-title-size": string
  readonly "--type-body-size": string
  readonly "--type-compact-size": string
  readonly "--type-toolbar-size": string
  readonly "--ui-font-family": string
}

export function appShellStyle(scale: number, font: UiFontFamily): AppShellStyle {
  return {
    "--type-title-size": `${18 * scale}px`,
    "--type-body-size": `${14 * scale}px`,
    "--type-compact-size": `${12 * scale}px`,
    "--type-toolbar-size": `${13 * scale}px`,
    "--ui-font-family": uiFontFamilyStack(font),
  }
}
