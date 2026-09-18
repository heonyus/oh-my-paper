import type { JSX } from "react"
import type { KnowledgeNodeId, KnowledgeRelation } from "../../../shared/knowledgeSchemas"
import { relationPredicateLabel } from "./knowledgeLabels"
import type { GraphPosition } from "./NeighbourGraphSelectors"

export function GraphEdges({
  relations,
  positions,
  markerId,
}: {
  readonly relations: readonly KnowledgeRelation[]
  readonly positions: ReadonlyMap<KnowledgeNodeId, GraphPosition>
  readonly markerId: string
}): JSX.Element {
  return (
    <svg className="neighbour-graph-edges" viewBox="0 0 1000 640" aria-hidden="true">
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 7 7"
          refX="6"
          refY="3.5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0 0L7 3.5L0 7Z" />
        </marker>
      </defs>
      {relations.map((relation) => {
        const source = positions.get(relation.sourceId)
        const target = positions.get(relation.targetId)
        if (!source || !target) return null
        const label = relationPredicateLabel(relation.predicate)
        const labelWidth = Math.max(44, label.length * 14)
        return (
          <g key={relation.id} className="neighbour-graph-edge-group">
            <line
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              data-review-state={relation.reviewState}
              markerEnd={`url(#${markerId})`}
            />
            <g
              className="neighbour-graph-edge-label"
              transform={`translate(${(source.x + target.x) / 2} ${(source.y + target.y) / 2})`}
            >
              <rect x={-labelWidth / 2} y="-11" width={labelWidth} height="22" rx="6" />
              <text x="0" y="4" textAnchor="middle">
                {label}
              </text>
            </g>
          </g>
        )
      })}
    </svg>
  )
}
