import type { AiRequest } from "../../shared/ipc"
import type { BoardTextSelection } from "./boardSelection"
import type { SelectionAction } from "./selectionActions"

export function selectionAiRequest(
  action: SelectionAction,
  selection: BoardTextSelection,
): Omit<AiRequest, "documentId"> | null {
  switch (action) {
    case "highlight":
    case "note":
      return null
    case "translation":
      return {
        action,
        page: selection.page,
        quote: selection.quote,
        before: selection.context.before,
        after: selection.context.after,
      }
    case "explanation":
    case "infographic":
      return {
        action,
        page: selection.page,
        quote: selection.quote,
        before: selection.context.before,
        after: selection.context.after,
        ...(selection.context.section ? { sectionContext: selection.context.section } : {}),
      }
  }
}
