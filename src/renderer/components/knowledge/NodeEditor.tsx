import type { JSX } from "react"
import type { KnowledgeNode } from "../../../shared/knowledgeSchemas"
import type { LocalInferenceApi } from "../../../shared/localInference"
import {
  type NoteAssetInsertRequest,
  type NoteAssetInsertResult,
  NoteEditor,
} from "../notes/NoteEditor"

export function NodeEditor({
  title,
  body,
  aliases,
  kind,
  metadata,
  dirty,
  nodes,
  saving,
  error,
  onTitleChange,
  onBodyChange,
  onAliasesChange,
  onSelectionChange,
  onAssetInsert,
  localInferenceApi = null,
  onSave,
  onSaveShortcut,
}: {
  readonly title: string
  readonly body: string
  readonly aliases: string
  readonly kind: KnowledgeNode["kind"]
  readonly metadata: Readonly<Record<string, unknown>>
  readonly dirty: boolean
  readonly nodes: readonly KnowledgeNode[]
  readonly saving: boolean
  readonly error: string | null
  readonly onTitleChange: (value: string) => void
  readonly onBodyChange: (value: string) => void
  readonly onAliasesChange: (value: string) => void
  readonly onSelectionChange?:
    | ((selection: { readonly from: number; readonly to: number }) => void)
    | undefined
  readonly onAssetInsert?:
    | ((request: NoteAssetInsertRequest) => Promise<NoteAssetInsertResult | null>)
    | undefined
  readonly localInferenceApi?: LocalInferenceApi | null | undefined
  readonly onSave: () => void
  readonly onSaveShortcut?: (() => void) | undefined
}): JSX.Element {
  const isNote = kind === "note"
  const properties = Object.keys(metadata)
  return (
    <div className={isNote ? "knowledge-note-canvas" : "knowledge-card"}>
      <label
        className={isNote ? "knowledge-note-title-label" : undefined}
        htmlFor="node-title-input"
      >
        {isNote ? "노트 제목" : "제목"}
      </label>
      <input
        id="node-title-input"
        className={isNote ? "knowledge-note-title" : "knowledge-input"}
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        aria-label="제목 수정"
      />
      {isNote ? (
        <details className="knowledge-note-details">
          <summary>세부 정보</summary>
          <div className="knowledge-note-details-body">
            <label htmlFor="node-aliases-input">별칭</label>
            <input
              id="node-aliases-input"
              className="knowledge-input"
              value={aliases}
              onChange={(event) => onAliasesChange(event.target.value)}
              aria-label="별칭 목록 입력"
            />
            <span className="knowledge-help">`[[` 뒤에서 기존 지식을 연결할 수 있습니다.</span>
            <span className="knowledge-help">
              속성 {properties.length === 0 ? "없음" : properties.join(", ")}
            </span>
          </div>
        </details>
      ) : (
        <>
          <label htmlFor="node-aliases-input">별칭</label>
          <input
            id="node-aliases-input"
            className="knowledge-input"
            value={aliases}
            onChange={(event) => onAliasesChange(event.target.value)}
            aria-label="별칭 목록 입력"
          />
          <label htmlFor="node-body-input">본문 · `[[` 뒤에서 기존 지식을 선택할 수 있습니다</label>
        </>
      )}
      <NoteEditor
        id="node-body-input"
        value={body}
        onChange={onBodyChange}
        nodes={nodes}
        documentFirst={isNote}
        ariaLabel="본문 내용 수정"
        onSaveShortcut={isNote ? onSaveShortcut : undefined}
        localInferenceApi={localInferenceApi}
        onSelectionChange={onSelectionChange}
        onAssetInsert={onAssetInsert}
      />
      {error ? (
        <p className="knowledge-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="knowledge-actions">
        {isNote ? (
          <span className="knowledge-save-hint" aria-live="polite">
            {dirty ? "저장 대기 중 · ⌘S로 저장" : "저장됨 · 자동 저장 안 함"}
          </span>
        ) : null}
        <button
          type="button"
          className="knowledge-btn knowledge-btn-primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  )
}
