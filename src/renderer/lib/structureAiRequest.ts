import type { AiAction, AiRequest } from "../../shared/ipc"
import type { DetectedStructure } from "./structureDetector"

function actionFor(structure: DetectedStructure): AiAction {
  return structure.kind === "section" ? "section" : structure.kind
}

export function structureAiRequest(
  structure: DetectedStructure,
  imageDataUrl: string | null,
  context: {
    readonly paper: string
    readonly section: string
    readonly sourceEvidence?: string | undefined
  },
): Omit<AiRequest, "documentId"> {
  const request = {
    action: actionFor(structure),
    page: structure.page,
    quote: structure.quote,
    before: "",
    after: "",
    paperContext: context.paper,
    sectionContext: context.section,
    featureKind: structure.kind === "section" ? "heading" : structure.kind,
    ...(context.sourceEvidence ? { sourceEvidence: context.sourceEvidence } : {}),
  } satisfies Omit<AiRequest, "documentId" | "imageDataUrl">
  return imageDataUrl ? { ...request, imageDataUrl } : request
}
