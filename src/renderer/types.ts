import type { AiRequest, ScourgifyApi } from "../shared/ipc"

export type BoardTool = "select" | "pan" | "sticky"
export type AiDeltaHandler = (delta: string) => void
export type AiRequestRunner = (
  request: Omit<AiRequest, "documentId">,
  onDelta?: AiDeltaHandler,
  signal?: AbortSignal,
) => Promise<string>

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
    readonly scourgify: ScourgifyApi
  }
}
