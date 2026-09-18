import { Trash2 } from "lucide-react"
import { type JSX, useEffect, useRef, useState } from "react"
import type { NoteFragment } from "../../../shared/fragmentAnchors"
import type {
  EvidenceAnchor,
  KnowledgeNode,
  KnowledgeNodeId,
  KnowledgeRelation,
  KnowledgeRelationId,
  RelationPredicate,
} from "../../../shared/knowledgeSchemas"
import type { CreateRelationInput, UpdateRelationInput } from "../../../shared/knowledgeTypes"
import { insertNoteAsset } from "../../lib/insertNoteAsset"
import { PaperBibliography } from "../bibliography/PaperBibliography"
import { NoteHistoryDialog } from "../collection/NoteHistoryDialog"
import { knowledgeNodeKindLabel } from "./knowledgeLabels"
import { NodeDetailRelations } from "./NodeDetailRelations"
import { NodeEditor } from "./NodeEditor"
import { NoteFragmentAction } from "./NoteFragmentAction"
import { NoteFragmentSource } from "./NoteFragmentSource"
import { useNodeDraft } from "./useNodeDraft"
import { WikiBody } from "./WikiBody"

interface NodeDetailViewProps {
  readonly node: KnowledgeNode | null
  readonly fragment: NoteFragment | null
  readonly onFragmentChange: (fragment: NoteFragment | null) => void
  readonly allNodes: readonly KnowledgeNode[]
  readonly relations: readonly KnowledgeRelation[]
  readonly evidenceByRelation: ReadonlyMap<KnowledgeRelationId, readonly EvidenceAnchor[]>
  readonly onUpdateNode: (updated: {
    readonly expectedBody?: string
    readonly title?: string
    readonly body?: string
    readonly aliases?: readonly string[]
  }) => Promise<KnowledgeNode>
  readonly onDeleteNode: () => Promise<void>
  readonly onCreateRelation: (relation: CreateRelationInput) => Promise<void>
  readonly onUpdateRelation: (relation: UpdateRelationInput) => Promise<void>
  readonly onJumpToEvidence: (anchorId: EvidenceAnchor["id"]) => void
  readonly onSelectNode: (nodeId: KnowledgeNodeId) => void
  readonly onEditingChange: (editing: boolean) => void
  readonly renderRelations?: boolean
  readonly newRelTargetId: KnowledgeNodeId | null
  readonly setNewRelTargetId: (value: KnowledgeNodeId | null) => void
  readonly newRelPredicate: RelationPredicate
  readonly setNewRelPredicate: (value: RelationPredicate) => void
}

export function NodeDetailView({
  node,
  fragment,
  onFragmentChange,
  allNodes,
  relations,
  evidenceByRelation,
  onUpdateNode,
  onDeleteNode,
  onCreateRelation,
  onUpdateRelation,
  onJumpToEvidence,
  onSelectNode,
  onEditingChange,
  renderRelations = true,
  newRelTargetId,
  setNewRelTargetId,
  newRelPredicate,
  setNewRelPredicate,
}: NodeDetailViewProps): JSX.Element {
  const draft = useNodeDraft(node, onUpdateNode, onEditingChange)
  const { editing: isEditing, saving, error, setError } = draft
  const [selection, setSelection] = useState({ from: 0, to: 0 })
  const [historyOpen, setHistoryOpen] = useState(false)
  const collection = window.scourgify?.collection
  const autoEditedNodeId = useRef<KnowledgeNodeId | null>(null)
  useEffect(() => {
    if (node?.kind !== "note" || autoEditedNodeId.current === node.id) return
    autoEditedNodeId.current = node.id
    draft.start()
  }, [draft.start, node?.id, node?.kind])

  if (!node) {
    return (
      <div className="knowledge-empty">
        왼쪽 목록에서 지식 항목을 선택하거나 새 항목을 생성하세요.
      </div>
    )
  }
  const currentNode = node

  async function removeNode(): Promise<void> {
    if (saving) return
    if (currentNode.kind === "paper") {
      setError("논문 원문 노드는 여기서 삭제할 수 없습니다.")
      return
    }
    if (!window.confirm(`'${currentNode.title}' 항목을 삭제할까요?`)) return
    try {
      await onDeleteNode()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "삭제하지 못했습니다.")
    }
  }

  return (
    <section className="knowledge-detail-content" aria-label="지식 상세 내용">
      <header className="knowledge-header">
        <div>
          <span className="knowledge-badge">{knowledgeNodeKindLabel(currentNode.kind)}</span>
          {!isEditing || currentNode.kind !== "note" ? (
            <h1 className="knowledge-detail-title">{currentNode.title}</h1>
          ) : null}
          {currentNode.aliases.length > 0 ? (
            <div className="knowledge-actions">
              {currentNode.aliases.map((alias) => (
                <span key={alias} className="knowledge-tag">
                  {alias}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="knowledge-actions">
          {currentNode.kind === "note" && collection ? (
            <button type="button" className="knowledge-btn" onClick={() => setHistoryOpen(true)}>
              변경 이력
            </button>
          ) : null}
          {isEditing && currentNode.kind === "note" && draft.dirty ? (
            <button type="button" className="knowledge-btn" disabled={saving} onClick={draft.reset}>
              변경 취소
            </button>
          ) : null}
          {!isEditing ? (
            <button type="button" className="knowledge-btn" onClick={draft.start}>
              편집
            </button>
          ) : null}
          {!isEditing || currentNode.kind === "note" ? (
            <button
              type="button"
              className="knowledge-btn"
              disabled={saving}
              onClick={() => void removeNode()}
              aria-label="지식 삭제"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <p className="knowledge-error" role="alert">
          {error}
        </p>
      ) : null}
      {fragment?.nodeId === currentNode.id ? (
        <NoteFragmentSource
          node={currentNode}
          anchor={fragment}
          onClose={() => onFragmentChange(null)}
        />
      ) : null}
      {isEditing ? (
        <NodeEditor
          title={draft.title}
          body={draft.body}
          aliases={draft.aliases}
          kind={currentNode.kind}
          metadata={currentNode.metadata}
          dirty={draft.dirty}
          nodes={allNodes}
          saving={saving}
          error={null}
          onTitleChange={draft.setTitle}
          onBodyChange={draft.setBody}
          onAliasesChange={draft.setAliases}
          onSelectionChange={setSelection}
          onAssetInsert={
            collection
              ? (request) =>
                  insertNoteAsset(request, currentNode.kind === "note" ? currentNode.id : undefined)
              : undefined
          }
          localInferenceApi={
            currentNode.kind === "note" ? (window.scourgify.localInference ?? null) : null
          }
          onSave={() => void draft.save(currentNode.kind === "note")}
          onSaveShortcut={() => void draft.save(true)}
        />
      ) : (
        <section className="knowledge-body-preview" aria-label="본문 내용">
          {currentNode.body ? (
            <WikiBody body={currentNode.body} nodes={allNodes} onNodeSelect={onSelectNode} />
          ) : (
            <span className="knowledge-help">작성된 내용이 없습니다.</span>
          )}
        </section>
      )}
      {isEditing && currentNode.kind === "note" ? (
        <NoteFragmentAction
          node={currentNode}
          body={draft.body}
          selection={selection}
          nodes={allNodes}
          saveBody={(body) => onUpdateNode({ body, expectedBody: draft.baseBody })}
          createRelation={onCreateRelation}
          onSaved={draft.markSaved}
        />
      ) : null}
      {!isEditing && currentNode.kind === "paper" ? (
        <PaperBibliography id={currentNode.id} onSaved={() => onSelectNode(currentNode.id)} />
      ) : null}
      {isEditing && currentNode.kind !== "note" ? (
        <button type="button" className="knowledge-btn" disabled={saving} onClick={draft.cancel}>
          취소
        </button>
      ) : null}
      {renderRelations && !isEditing ? (
        <NodeDetailRelations
          node={currentNode}
          allNodes={allNodes}
          relations={relations}
          evidenceByRelation={evidenceByRelation}
          onCreateRelation={onCreateRelation}
          onUpdateRelation={onUpdateRelation}
          onJumpToEvidence={onJumpToEvidence}
          onSelectNode={onSelectNode}
          onOpenFragment={(anchor) => {
            onFragmentChange(anchor)
            onSelectNode(anchor.nodeId)
          }}
          newRelTargetId={newRelTargetId}
          setNewRelTargetId={setNewRelTargetId}
          newRelPredicate={newRelPredicate}
          setNewRelPredicate={setNewRelPredicate}
        />
      ) : renderRelations ? (
        <details className="knowledge-note-relations">
          <summary>연결 및 백링크</summary>
          <NodeDetailRelations
            node={currentNode}
            allNodes={allNodes}
            relations={relations}
            evidenceByRelation={evidenceByRelation}
            onCreateRelation={onCreateRelation}
            onUpdateRelation={onUpdateRelation}
            onJumpToEvidence={onJumpToEvidence}
            onSelectNode={onSelectNode}
            onOpenFragment={(anchor) => {
              onFragmentChange(anchor)
              onSelectNode(anchor.nodeId)
            }}
            newRelTargetId={newRelTargetId}
            setNewRelTargetId={setNewRelTargetId}
            newRelPredicate={newRelPredicate}
            setNewRelPredicate={setNewRelPredicate}
          />
        </details>
      ) : null}
      {historyOpen && collection ? (
        <NoteHistoryDialog
          api={collection}
          noteId={currentNode.id}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => onSelectNode(currentNode.id)}
        />
      ) : null}
    </section>
  )
}
