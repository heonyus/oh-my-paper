import type { Locale } from "../../shared/i18n/locale"
import { type PreparationUpdate, preparationSteps } from "../../shared/ipc"
import type { DocumentId, Workspace } from "../../shared/schemas"
import { type LibraryMessageKey, libraryMessages } from "../messages/library"
import type { PreparedSummary } from "./pdfDocumentFeatures"

/** The catalog key naming each preparation step. */
export const preparationStepLabels: Readonly<Record<PreparationUpdate["step"], LibraryMessageKey>> =
  {
    pdf_check: "prep.step.pdf_check",
    register: "prep.step.register",
    layout: "prep.step.layout",
    text_extract: "prep.step.text_extract",
    anchors: "prep.step.anchors",
    metadata: "prep.step.metadata",
    quality: "prep.step.quality",
    ready: "prep.step.ready",
  }

export function completedPreparation(
  summary: PreparedSummary,
  locale: Locale,
): readonly PreparationUpdate[] {
  return preparationSteps.map((step) => ({
    step,
    state: step === "quality" && summary.needsOcr ? "warning" : "complete",
    message: libraryMessages[locale][preparationStepLabels[step]],
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
    document.quality.needsOcr === summary.needsOcr &&
    document.kind === summary.kind
  )
    return workspace
  const updated = {
    ...document,
    pageCount: summary.pages,
    title: summary.title,
    kind: summary.kind,
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
