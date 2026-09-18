import { createHash } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { type KnowledgeEndpoint, locateNoteFragment } from "../shared/fragmentAnchors"
import type { KnowledgeNode } from "../shared/knowledgeSchemas"
import { sha256Schema } from "../shared/schemas"

export function validateKnowledgeEndpoint(
  db: DatabaseSync,
  node: KnowledgeNode,
  endpoint: KnowledgeEndpoint | undefined,
): void {
  if (!endpoint) return
  switch (endpoint.kind) {
    case "node":
      if (endpoint.nodeId !== node.id) throw new Error("Endpoint does not belong to this node")
      return
    case "note-fragment": {
      if (endpoint.anchor.nodeId !== node.id || node.kind !== "note") {
        throw new Error("Note endpoint does not belong to this node")
      }
      const revision = sha256Schema.parse(createHash("sha256").update(node.body).digest("hex"))
      if (
        endpoint.anchor.revision !== revision ||
        locateNoteFragment(endpoint.anchor, { text: node.body, revision }).status !== "resolved"
      ) {
        throw new Error("Stale note selection; select the passage again")
      }
      return
    }
    case "pdf-fragment": {
      const row = db
        .prepare(`SELECT v.paper_node_id FROM evidence_anchors a
        JOIN document_versions v ON v.id = a.document_version_id WHERE a.id = ?`)
        .get(endpoint.anchorId)
      const owner = z.object({ paper_node_id: z.string() }).safeParse(row)
      if (!owner.success || owner.data.paper_node_id !== node.id) {
        throw new Error("PDF endpoint does not belong to this paper")
      }
      return
    }
  }
}
