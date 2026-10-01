import {
  type WorkspacePatchRequest,
  type WorkspacePatchResult,
  workspacePatchRequestSchema,
  workspacePatchSavedSchema,
} from "../shared/workspacePatch"
import { readLocalResponse } from "./localTransport"

// Browsers refuse keepalive requests whose bodies together exceed 64 KiB; leave headroom.
const KEEPALIVE_BODY_LIMIT = 60_000

/**
 * Posts a patch save to the loopback server. 409 means the server cannot use the base; 404 means
 * a server started before patch saves existed, which still takes full saves. Small patches are
 * sent with `keepalive` so the last save started as the page closes still reaches the server.
 */
export async function saveLocalWorkspacePatch(
  request: WorkspacePatchRequest,
): Promise<WorkspacePatchResult> {
  const body = JSON.stringify(workspacePatchRequestSchema.parse(request))
  const response = await fetch("/api/workspace/patch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: new TextEncoder().encode(body).byteLength <= KEEPALIVE_BODY_LIMIT,
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 409) return { status: "conflict" }
  if (response.status === 404) return { status: "unsupported" }
  return readLocalResponse(response, workspacePatchSavedSchema)
}
