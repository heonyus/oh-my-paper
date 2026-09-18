import type { DocumentRecord } from "../types"

export const documentKindLabels = {
  research_paper: "논문",
  report: "보고서",
  manual: "매뉴얼",
  contract: "계약서",
  presentation: "발표 자료",
  document: "문서",
} satisfies Record<DocumentRecord["kind"], string>

export function documentAuthors(document: DocumentRecord): string {
  return document.authors.slice(0, 3).join(", ") || "저자 정보 없음"
}

export function documentSearchText(document: DocumentRecord): string {
  return [document.title, document.name, document.authors.join(" "), document.doi ?? ""]
    .join(" ")
    .toLocaleLowerCase()
}

export function formatImportedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value))
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function normalizedReadingPage(document: DocumentRecord): number | null {
  const page = document.lastReadPage
  return typeof page === "number" && page > 0 && page <= document.pageCount ? page : null
}
