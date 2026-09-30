import type { Catalog } from "../../shared/i18n/locale"

const ko = {
  "settings.language": "언어",
  "settings.languageAuto": "자동 (브라우저 언어)",
} as const

const en: Readonly<Record<keyof typeof ko, string>> = {
  "settings.language": "Language",
  "settings.languageAuto": "Automatic (browser language)",
}

export const settingsMessages: Catalog<typeof ko> = { ko, en }
