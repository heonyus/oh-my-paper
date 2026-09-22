import { type JSX, useEffect, useState } from "react"
import type { BoardRecord, KnowledgeNode, KnowledgeNodeId } from "../../shared/knowledgeSchemas"
import { RecoveryPanel } from "./collection/RecoveryPanel"
import "./collection/collection-history.css"
import {
  chooseImport,
  commitImport,
  type ImportFormat,
  type ImportPreview,
  previewLines,
} from "../lib/interchangeUi"
import "./knowledge/knowledge.css"
import { BackupPanel } from "./backup/BackupPanel"
import { ExportPanel } from "./export/ExportPanel"

export function DataExchangeDialog({
  onClose,
  onNodeOpen,
}: {
  readonly onClose: () => void
  readonly onNodeOpen?: (id: KnowledgeNodeId) => void
}): JSX.Element {
  const [format, setFormat] = useState<ImportFormat>("markdown")
  const [boards, setBoards] = useState<readonly BoardRecord[]>([])
  const [nodes, setNodes] = useState<readonly KnowledgeNode[]>([])
  const [boardId, setBoardId] = useState("")
  const [nodeId, setNodeId] = useState("")
  const [search, setSearch] = useState("")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const api = window.ohmypaper.interchange
  useEffect(() => {
    void window.ohmypaper.knowledge
      .getOrCreateDefaultBoard()
      .then(async (board) => {
        setBoardId(board.id)
        setBoards(await window.ohmypaper.knowledge.listBoards())
      })
      .catch((error: unknown) => setMessage(String(error)))
  }, [])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      void window.ohmypaper.knowledge
        .findNodes({ search, limit: 100 })
        .then((values) => {
          if (current) setNodes(values)
        })
        .catch((error: unknown) => {
          if (current) setMessage(String(error))
        })
    }, 180)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [search])
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setMessage("")
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "작업 실패")
    } finally {
      setBusy(false)
    }
  }
  async function commit(): Promise<void> {
    const board = boards.find((item) => item.id === boardId)
    const node = nodes.find((item) => item.id === nodeId)
    if (!preview?.value.isValid || !board) throw new Error("유효한 미리보기와 보드를 선택하세요.")
    await commitImport(api, preview, board.id, node?.kind === "hypothesis" ? node.id : undefined)
    setPreview(null)
    setMessage("가져왔습니다. 지식 또는 프로젝트에서 확인하세요.")
  }
  async function exportFile(): Promise<void> {
    if (format === "markdown") {
      const node = nodes.find((item) => item.id === nodeId)
      if (!node) throw new Error("내보낼 항목을 선택하세요.")
      const result = await api.saveFile({
        defaultName: `${node.id}.md`,
        content: await api.exportMarkdown(node.id),
      })
      setMessage(result.saved ? "Markdown 저장 완료" : "저장 취소됨")
    } else if (format === "canvas") {
      const board = boards.find((item) => item.id === boardId)
      if (!board) throw new Error("보드를 선택하세요.")
      const result = await api.exportCanvas(board.id)
      const canvas = await api.saveFile({
        defaultName: `${board.id}.canvas`,
        content: JSON.stringify(result.canvas, null, 2),
      })
      if (!canvas.saved) {
        setMessage("저장 취소됨")
        return
      }
      const sidecar = await api.saveFile({
        defaultName: `${board.id}.ohmypaper.json`,
        content: JSON.stringify(result.sidecar, null, 2),
      })
      setMessage(
        sidecar.saved
          ? "Canvas와 의미 정보 파일 저장 완료"
          : "Canvas만 저장됐습니다. 원문 근거 보존에는 함께 저장되는 JSON 파일도 필요합니다.",
      )
    }
  }
  return (
    <div className="modal-backdrop settings-backdrop" role="presentation">
      <section
        className="settings-modal data-exchange-modal"
        role="dialog"
        aria-modal="true"
        aria-label="데이터 가져오기·내보내기"
      >
        <div className="settings-content">
          <header className="settings-content-head">
            <h2>데이터 가져오기·내보내기</h2>
            <button
              type="button"
              className="settings-btn-secondary"
              disabled={busy}
              onClick={onClose}
            >
              닫기
            </button>
          </header>
          <div className="settings-content-body knowledge-pane">
            {window.ohmypaper.account ? (
              <RecoveryPanel
                api={window.ohmypaper.account}
                collection={window.ohmypaper.collection}
                createNote={window.ohmypaper.knowledge.createNode}
                onOpen={onNodeOpen}
              />
            ) : null}
            {window.ohmypaper.export ? (
              <ExportPanel api={window.ohmypaper.export} nodes={nodes} />
            ) : null}
            {window.ohmypaper.backup ? <BackupPanel api={window.ohmypaper.backup} /> : null}
            <label className="knowledge-row">
              형식
              <select
                className="knowledge-input"
                value={format}
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.value
                  if (
                    value === "markdown" ||
                    value === "canvas" ||
                    value === "experiment" ||
                    value === "zotero"
                  ) {
                    setFormat(value)
                    setPreview(null)
                    setMessage("")
                  }
                }}
              >
                <option value="markdown">Markdown</option>
                <option value="canvas">Canvas + JSON</option>
                <option value="experiment">집계 실험 JSONL</option>
                <option value="zotero">Zotero</option>
              </select>
            </label>
            <p className="knowledge-help">
              파일은 미리보기 확인 후 저장합니다. 기존 항목과 충돌하면 덮어쓰지 않습니다. 실험은
              환자별 기록이 아닌 집계 결과만 받습니다.
            </p>
            <label className="knowledge-row">
              대상 보드
              <select
                className="knowledge-input"
                value={boardId}
                disabled={busy}
                onChange={(event) => setBoardId(event.target.value)}
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="knowledge-row">
              항목 검색
              <input
                className="knowledge-input"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setNodeId("")
                }}
              />
            </label>
            <label className="knowledge-row">
              {format === "experiment" ? "연결할 가설 (선택)" : "내보낼 항목"}
              <select
                className="knowledge-input"
                value={nodeId}
                disabled={busy}
                onChange={(event) => setNodeId(event.target.value)}
              >
                <option value="">선택 안 함</option>
                {nodes
                  .filter((node) => format !== "experiment" || node.kind === "hypothesis")
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title}
                    </option>
                  ))}
              </select>
            </label>
            <div className="knowledge-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setPreview(null)
                    setPreview(await chooseImport(api, format))
                  })
                }
              >
                파일 선택·미리보기
              </button>
              {format === "zotero" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setPreview(null)
                      setPreview({ kind: "zotero", value: await api.fetchAndPreviewLocalZotero() })
                    })
                  }
                >
                  로컬 Zotero에서 읽기
                </button>
              ) : null}
              {format === "markdown" || format === "canvas" ? (
                <button type="button" disabled={busy} onClick={() => void run(exportFile)}>
                  내보내기
                </button>
              ) : null}
            </div>
            {preview ? (
              <section aria-label="가져오기 미리보기">
                <h3>{preview.value.isValid ? "저장할 변경 사항" : "확인 필요 · 저장 불가"}</h3>
                <ul>
                  {[...new Set(previewLines(preview))].slice(0, 100).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {previewLines(preview).length > 100 ? <p>앞 100개만 표시합니다.</p> : null}
                <button
                  type="button"
                  disabled={busy || !preview.value.isValid}
                  onClick={() => void run(commit)}
                >
                  확인하고 가져오기
                </button>
              </section>
            ) : null}
            {busy ? <p role="status">처리 중…</p> : null}
            {message ? <p role="status">{message}</p> : null}
          </div>
        </div>
      </section>
    </div>
  )
}
