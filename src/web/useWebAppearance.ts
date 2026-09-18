import { type CSSProperties, useCallback, useState } from "react"
import { type AppearancePreferences, appearancePreferencesSchema } from "../shared/schemas"
import { uiFontFamilyStack } from "../shared/uiAppearance"

const storageKey = "scourgify-web-appearance"
const fallback = appearancePreferencesSchema.parse({})

type WebAppearanceStyle = CSSProperties & {
  readonly "--ui-font-family": string
  readonly "--type-title-size": string
  readonly "--type-body-size": string
  readonly "--type-compact-size": string
  readonly "--type-toolbar-size": string
}

function readAppearance(): AppearancePreferences {
  try {
    const serialized = localStorage.getItem(storageKey)
    if (!serialized) return fallback
    const parsed = appearancePreferencesSchema.safeParse(JSON.parse(serialized))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

function appearanceStyle(value: AppearancePreferences): WebAppearanceStyle {
  return {
    "--ui-font-family": uiFontFamilyStack(value.uiFontFamily),
    "--type-title-size": `${18 * value.uiFontScale}px`,
    "--type-body-size": `${14 * value.uiFontScale}px`,
    "--type-compact-size": `${12 * value.uiFontScale}px`,
    "--type-toolbar-size": `${13 * value.uiFontScale}px`,
  }
}

export function useWebAppearance(): {
  readonly value: AppearancePreferences
  readonly style: WebAppearanceStyle
  readonly set: (value: AppearancePreferences) => void
} {
  const [value, setValue] = useState(readAppearance)
  const set = useCallback((next: AppearancePreferences): void => {
    const parsed = appearancePreferencesSchema.parse(next)
    localStorage.setItem(storageKey, JSON.stringify(parsed))
    setValue(parsed)
  }, [])
  return { value, style: appearanceStyle(value), set }
}
