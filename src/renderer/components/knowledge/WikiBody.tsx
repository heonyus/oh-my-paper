import type { JSX } from "react"
import type { KnowledgeNode, KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import { NotePreview } from "../notes/NotePreview"

export function WikiBody({
  body,
  nodes,
  onNodeSelect,
}: {
  readonly body: string
  readonly nodes: readonly KnowledgeNode[]
  readonly onNodeSelect: (nodeId: KnowledgeNodeId) => void
}): JSX.Element {
  return (
    <div className="knowledge-body">
      <NotePreview source={body} nodes={nodes} onNodeSelect={onNodeSelect} />
    </div>
  )
}
