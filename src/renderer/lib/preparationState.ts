import { type PreparationUpdate, preparationSteps } from "../../shared/ipc"
import type { DocumentId, Workspace } from "../../shared/schemas"
import type { PreparedSummary } from "../components/PdfColumn"

const labels: Readonly<Record<PreparationUpdate["step"], string>> = {
  pdf_check: "PDF 확인",
  register: "문서 등록",
  layout: "페이지 구성",
  text_extract: "텍스트 추출",
  anchors: "앵커 생성",
  metadata: "메타정보",
  quality: "품질 검사",
  ready: "보드 준비 완료",
}

export function completedPreparation(summary: PreparedSummary): readonly PreparationUpdate[] {
  return preparationSteps.map((step) => ({
    step,
    state: step === "quality" && summary.needsOcr ? "warning" : "complete",
    message: labels[step],
  }))
}

export function applyPreparedSummary(
  workspace: Workspace,
  documentId: DocumentId,
  summary: PreparedSummary,
): Workspace {
  const document = workspace.documents.find((candidate) => candidate.id === documentId)
  if (!document) return workspace
  if (
    document.pageCount === summary.pages &&
    document.title === summary.title &&
    document.quality.textCharacters === summary.textCharacters &&
    document.quality.needsOcr === summary.needsOcr
  )
    return workspace
  const updated = {
    ...document,
    pageCount: summary.pages,
    title: summary.title,
    quality: {
      textCharacters: summary.textCharacters,
      needsOcr: summary.needsOcr,
      warnings: summary.needsOcr ? ["OCR이 필요한 페이지를 확인하세요."] : [],
    },
  }
  return {
    ...workspace,
    documents: workspace.documents.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    ),
  }
}
