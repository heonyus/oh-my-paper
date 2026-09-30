import type { Catalog, Locale } from "./i18n/locale"
import type { DocumentKind } from "./schemas"

const patterns: Readonly<Record<Exclude<DocumentKind, "document">, RegExp>> = {
  research_paper: /\babstract\b[\s\S]{0,3000}\b(?:introduction|methods?|results?|references)\b/iu,
  report: /\b(?:executive summary|annual report|technical report|findings|recommendations)\b/iu,
  manual: /\b(?:user (?:manual|guide)|installation|instructions|troubleshooting|how to use)\b/iu,
  contract: /\b(?:agreement|terms and conditions|effective date|governing law|party|parties)\b/iu,
  presentation: /\b(?:agenda|speaker notes|thank you|questions\?)\b/iu,
}

export function detectDocumentKind(text: string, pageCount: number): DocumentKind {
  const normalized = text.replace(/\s+/gu, " ").slice(0, 80_000)
  for (const kind of ["research_paper", "contract", "manual", "report"] as const) {
    if (patterns[kind].test(normalized)) return kind
  }
  const words = normalized.split(" ").filter(Boolean).length
  if (pageCount >= 4 && words / pageCount < 110 && patterns.presentation.test(normalized)) {
    return "presentation"
  }
  return "document"
}

/** Korean names the AI prompts use; the screen names a kind with `documentKindName`. */
export const documentKindLabels: Readonly<Record<DocumentKind, string>> = {
  research_paper: "연구 논문",
  report: "보고서",
  manual: "매뉴얼",
  contract: "계약·정책",
  presentation: "프레젠테이션",
  document: "PDF 문서",
}

const ko = {
  research_paper: "논문",
  report: "보고서",
  manual: "매뉴얼",
  contract: "계약서",
  presentation: "발표 자료",
  document: "문서",
} as const satisfies Readonly<Record<DocumentKind, string>>

const en: Readonly<Record<keyof typeof ko, string>> = {
  research_paper: "Paper",
  report: "Report",
  manual: "Manual",
  contract: "Contract",
  presentation: "Slides",
  document: "Document",
}

/** The short names the library shows for each kind. */
export const documentKindMessages: Catalog<typeof ko> = { ko, en }

/** A document kind as the library names it, in the app's language. */
export function documentKindName(kind: DocumentKind, locale: Locale): string {
  return documentKindMessages[locale][kind]
}
