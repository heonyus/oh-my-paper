import type { AiRequest } from "../../shared/ipc"
import type { BoardTextSelection } from "./boardSelection"
import type { SelectionAction } from "./selectionActions"

/** Room left in the paper context for the cached summary and overview that follow. */
const RELATED_PASSAGES_MAX_CHARACTERS = 5_000

/**
 * The request for an action on a selected passage. `relatedPassages` holds passages from the
 * rest of the document that share the passage's terms, so an explanation can find where a
 * symbol or a "these cases" is defined instead of calling it missing.
 */
export function selectionAiRequest(
  action: SelectionAction,
  selection: BoardTextSelection,
  relatedPassages = "",
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
    case "infographic": {
      const related = relatedPassages.trim().slice(0, RELATED_PASSAGES_MAX_CHARACTERS)
      return {
        action,
        page: selection.page,
        quote: selection.quote,
        before: selection.context.before,
        after: selection.context.after,
        ...(selection.context.section ? { sectionContext: selection.context.section } : {}),
        ...(related
          ? {
              paperContext: `Passages elsewhere in the document that share the target's terms:\n${related}`,
            }
          : {}),
      }
    }
  }
}
