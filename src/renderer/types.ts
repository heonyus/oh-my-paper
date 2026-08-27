import type { HotebookApi } from "../shared/ipc"

export type BoardTool = "select" | "pan"

export type {
  BoardCard,
  CardId,
  DocumentId,
  DocumentRecord,
  Point,
  SourceAnchor,
  SourceFragment,
  Viewport,
  Workspace,
} from "../shared/schemas"

declare global {
  interface Window {
    readonly hotebook: HotebookApi
  }
}
