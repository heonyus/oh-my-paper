import { type KnowledgeNodeId, knowledgeNodeIdSchema } from "../../../shared/knowledgeSchemas"

export function parseLocalResearchSourceId(value: string): KnowledgeNodeId | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== "ohmypaper:" ||
      url.hostname !== "node" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.search !== "" ||
      url.hash !== ""
    )
      return null
    const rawId = url.pathname.startsWith("/") ? url.pathname.slice(1) : ""
    if (rawId === "" || rawId.includes("/")) return null
    const id = knowledgeNodeIdSchema.safeParse(rawId)
    return id.success ? id.data : null
  } catch {
    return null
  }
}
