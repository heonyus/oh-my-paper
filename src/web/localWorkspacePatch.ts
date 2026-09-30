import {
  type WorkspacePatchRequest,
  type WorkspacePatchResult,
  workspacePatchRequestSchema,
  workspacePatchSavedSchema,
} from "../shared/workspacePatch"
import { readLocalResponse } from "./localTransport"

/**
 * Posts a patch save to the loopback server. 409 means the server cannot use the base; 404 means
 * a server started before patch saves existed, which still takes full saves.
 */
export async function saveLocalWorkspacePatch(
  request: WorkspacePatchRequest,
): Promise<WorkspacePatchResult> {
  const response = await fetch("/api/workspace/patch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(workspacePatchRequestSchema.parse(request)),
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 409) return { status: "conflict" }
  if (response.status === 404) return { status: "unsupported" }
  return readLocalResponse(response, workspacePatchSavedSchema)
}
