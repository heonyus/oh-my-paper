import { type JSX, useState } from "react"
import type { ExportApi, ExportFormat, ExportPreview } from "../../../shared/exportIpc"
import {
  type KnowledgeNode,
  type KnowledgeNodeId,
  knowledgeNodeIdSchema,
} from "../../../shared/knowledgeSchemas"

const formats = [
  ["markdown", "Markdown"],
  ["html", "HTML"],
  ["docx", "DOCX"],
  ["pdf", "PDF"],
] as const satisfies readonly (readonly [ExportFormat, string])[]

export function ExportPanel({
  api,
  nodes,
}: {
  readonly api: ExportApi
  readonly nodes: readonly KnowledgeNode[]
}): JSX.Element {
  const notes = nodes.filter((node) => node.kind === "note")
  const [nodeId, setNodeId] = useState<KnowledgeNodeId | "">("")
  const [format, setFormat] = useState<ExportFormat>("markdown")
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setMessage("")
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "내보내기에 실패했습니다.")
    } finally {
      setBusy(false)
    }
  }

  async function previewSelected(): Promise<void> {
    if (!nodeId) throw new Error("내보낼 노트를 선택하세요.")
    setPreview(await api.preview(nodeId))
    setMessage("저장된 노트와 연결된 자료를 확인했습니다.")
  }

  async function save(): Promise<void> {
    if (!preview) throw new Error("먼저 미리보기를 확인하세요.")
    const result = await api.save({ nodeId: preview.nodeId, revision: preview.revision, format })
    setMessage(result.saved ? `${result.fileName ?? "파일"} 저장 완료` : "저장 취소됨")
  }

  return (
    <section className="knowledge-card" aria-labelledby="export-panel-title">
      <h2 id="export-panel-title">선택한 노트 내보내기</h2>
      <p className="knowledge-help">저장된 노트와 연결된 자료를 파일로 내보냅니다.</p>
      <label className="knowledge-row" htmlFor="export-note">
        <span>내보낼 노트</span>
        <select
          id="export-note"
          aria-label="내보낼 노트"
          className="knowledge-input"
          value={nodeId}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value
            const parsed = knowledgeNodeIdSchema.safeParse(value)
            setNodeId(parsed.success ? parsed.data : "")
            setPreview(null)
            setMessage("")
          }}
        >
          <option value="">노트 선택...</option>
          {notes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </label>
      <label className="knowledge-row" htmlFor="export-format">
        <span>형식</span>
        <select
          id="export-format"
          className="knowledge-input"
          value={format}
          disabled={busy}
          onChange={(event) => {
            const value = event.target.value
            if (value === "markdown" || value === "html" || value === "docx" || value === "pdf") {
              setFormat(value)
              setMessage("")
            }
          }}
        >
          {formats.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="knowledge-actions">
        <button
          type="button"
          className="knowledge-btn"
          disabled={busy || !nodeId}
          onClick={() => void run(previewSelected)}
        >
          미리보기
        </button>
        <button
          type="button"
          className="knowledge-btn knowledge-btn-primary"
          disabled={busy || !preview}
          onClick={() => void run(save)}
        >
          파일로 저장
        </button>
      </div>
      {preview ? (
        <section className="knowledge-help" aria-label="내보내기 미리보기">
          <strong>{preview.title}</strong>
          <p>
            연결된 기록 {preview.recordCount}개 · 이미지 {preview.assetCount}개 · 참고문헌{" "}
            {preview.bibliographyCount}개 · 출처 {preview.sourceCount}개
          </p>
          <p>
            원본 확인 완료
            {preview.limitationCount > 0
              ? ` · 내보내기에서 제외될 항목 ${preview.limitationCount}개`
              : " · 제외되는 항목 없음"}
          </p>
        </section>
      ) : null}
      {busy ? (
        <p className="knowledge-status" role="status">
          준비 중…
        </p>
      ) : null}
      {message ? (
        <p className="knowledge-status" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
