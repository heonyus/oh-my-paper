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

export const documentKindLabels: Readonly<Record<DocumentKind, string>> = {
  research_paper: "연구 논문",
  report: "보고서",
  manual: "매뉴얼",
  contract: "계약·정책",
  presentation: "프레젠테이션",
  document: "PDF 문서",
}
