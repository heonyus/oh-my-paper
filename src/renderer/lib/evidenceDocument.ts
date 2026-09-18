import type { EvidenceNavigationTarget } from "../../shared/knowledgeTypes"
import type { DocumentRecord } from "../../shared/schemas"

export function evidenceDocument(
  target: EvidenceNavigationTarget,
  documents: readonly DocumentRecord[],
): DocumentRecord {
  const document =
    documents.find((item) => item.id === target.originalDocumentId && item.hash === target.hash) ??
    documents.find((item) => item.hash === target.hash)
  if (!document)
    throw new Error(
      "이 근거의 원본 PDF 버전이 라이브러리에 없습니다. 동일한 파일을 다시 가져오세요.",
    )
  if (target.page > document.pageCount) throw new Error("원문 페이지를 확인할 수 없습니다.")
  return document
}
