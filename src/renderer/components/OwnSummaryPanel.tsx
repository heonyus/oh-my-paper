import { type JSX, useEffect, useId, useRef, useState } from "react"
import { ZodError } from "zod"
import type { ProviderStatus } from "../../shared/ipc"
import {
  emptyOwnSummaryLines,
  OWN_SUMMARY_LINE_MAX_CHARACTERS,
  OWN_SUMMARY_LINES,
  type OwnSummary,
  type OwnSummaryLine,
  type OwnSummaryLines,
  ownSummaryRevealed,
} from "../../shared/ownSummary"
import type { SourceCitation } from "../lib/chatCitations"
import { checkOwnSummary, writtenLines } from "../lib/ownSummaryCheck"
import type { OwnSummaryUpdate } from "../lib/useOwnSummary"
import type { AiRequestRunner, DocumentRecord } from "../types"
import { OwnSummaryResult, ownSummaryLineLabels } from "./OwnSummaryResult"

const placeholders: Readonly<Record<OwnSummaryLine, string>> = {
  problem: "무엇을 풀려고 했나",
  method: "어떻게 풀었나",
  result: "무엇을 보였나",
}

function trimmedLines(lines: OwnSummaryLines): OwnSummaryLines {
  return { problem: lines.problem.trim(), method: lines.method.trim(), result: lines.result.trim() }
}

function checkFailure(error: unknown, configured: boolean): string {
  if (!configured) return "AI 설정을 확인해주세요."
  if (error instanceof SyntaxError || error instanceof ZodError)
    return "대조 결과를 읽지 못했습니다. 다시 시도해주세요."
  return "대조하지 못했습니다. 다시 시도해주세요."
}

/**
 * The reader's three lines come before the AI overview: submitting or skipping reveals it,
 * and a submitted summary is checked line by line against the paper with quoted evidence.
 */
export function OwnSummaryPanel({
  document,
  provider,
  summary,
  onChange,
  onAiRequest,
  onNavigateToSource,
}: {
  readonly document: DocumentRecord
  readonly provider: ProviderStatus
  readonly summary: OwnSummary | undefined
  readonly onChange: (next: OwnSummaryUpdate) => void
  readonly onAiRequest: AiRequestRunner
  readonly onNavigateToSource?: ((citation: SourceCitation) => void) | undefined
}): JSX.Element {
  const revealed = ownSummaryRevealed(summary)
  const [editing, setEditing] = useState(() => !summary || summary.status === "draft")
  const [lines, setLines] = useState<OwnSummaryLines>(() => summary?.lines ?? emptyOwnSummaryLines)
  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState({ text: "", failed: false })
  const active = useRef<AbortController | null>(null)
  const fieldId = useId()
  useEffect(() => () => active.current?.abort(), [])

  async function runCheck(checked: OwnSummaryLines, afterReveal: boolean): Promise<void> {
    active.current?.abort()
    if (writtenLines(checked).length === 0) return
    const controller = new AbortController()
    active.current = controller
    setChecking(true)
    setCheckMessage({ text: "", failed: false })
    try {
      const check = await checkOwnSummary(document, checked, onAiRequest, controller.signal)
      if (!controller.signal.aborted)
        onChange({ status: "submitted", afterReveal, lines: checked, check })
    } catch (error) {
      if (!controller.signal.aborted)
        setCheckMessage({ text: checkFailure(error, provider.configured), failed: true })
    } finally {
      if (active.current === controller) {
        active.current = null
        setChecking(false)
      }
    }
  }

  function cancelCheck(): void {
    active.current?.abort()
    active.current = null
    setChecking(false)
    setCheckMessage({ text: "대조를 취소했습니다.", failed: false })
  }

  function submit(): void {
    const submitted = trimmedLines(lines)
    const afterReveal = revealed
    onChange({ status: "submitted", afterReveal, lines: submitted })
    setLines(submitted)
    setEditing(false)
    void runCheck(submitted, afterReveal)
  }

  function saveDraft(): void {
    const saved = summary?.lines ?? emptyOwnSummaryLines
    if (revealed || JSON.stringify(lines) === JSON.stringify(saved)) return
    onChange({ status: "draft", afterReveal: false, lines })
  }

  function skip(): void {
    onChange({ status: "skipped", afterReveal: false, lines })
    setEditing(false)
  }

  function stopEditing(): void {
    setLines(summary?.lines ?? emptyOwnSummaryLines)
    setEditing(false)
  }

  if (editing) {
    return (
      <section className="own-summary" aria-label="내 3줄">
        <h3 className="own-summary-title">내 3줄</h3>
        <p className="own-summary-hint">
          {revealed
            ? "AI 요약을 본 뒤에 쓴 3줄은 따로 표시됩니다."
            : "다 읽은 뒤, 논문을 보지 않고 떠올려 적어보세요. 적고 나면 AI 요약이 열리고 각 줄을 원문과 대조합니다."}
        </p>
        {OWN_SUMMARY_LINES.map((line) => (
          <div key={line} className="own-summary-field">
            <label htmlFor={`${fieldId}-${line}`}>{ownSummaryLineLabels[line]}</label>
            <textarea
              id={`${fieldId}-${line}`}
              rows={2}
              maxLength={OWN_SUMMARY_LINE_MAX_CHARACTERS}
              placeholder={placeholders[line]}
              value={lines[line]}
              onChange={(event) => setLines({ ...lines, [line]: event.target.value })}
              onBlur={saveDraft}
            />
          </div>
        ))}
        <div className="own-summary-actions">
          <button
            type="button"
            className="own-summary-primary"
            disabled={writtenLines(lines).length === 0}
            onClick={submit}
          >
            제출하고 대조하기
          </button>
          {revealed ? (
            <button type="button" onClick={stopEditing}>
              취소
            </button>
          ) : (
            <button type="button" onClick={skip}>
              건너뛰고 AI 요약 보기
            </button>
          )}
        </div>
      </section>
    )
  }
  if (summary?.status !== "submitted") {
    return (
      <section className="own-summary" aria-label="내 3줄">
        <p className="own-summary-hint">내 3줄을 건너뛰었습니다.</p>
        <div className="own-summary-actions">
          <button type="button" onClick={() => setEditing(true)}>
            내 3줄 쓰기
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="own-summary" aria-label="내 3줄" aria-busy={checking}>
      <h3 className="own-summary-title">
        내 3줄
        {summary.afterReveal ? <span className="own-summary-tag">AI 요약을 본 뒤 작성</span> : null}
      </h3>
      <OwnSummaryResult summary={summary} onNavigateToSource={onNavigateToSource} />
      {checking ? <span className="insight-progress" aria-hidden="true" /> : null}
      <p
        className="own-summary-status"
        role="status"
        data-failed={!checking && checkMessage.failed}
      >
        {checking ? "원문과 대조하는 중" : checkMessage.text}
      </p>
      <div className="own-summary-actions">
        {checking ? (
          <button type="button" onClick={cancelCheck}>
            대조 취소
          </button>
        ) : (
          <button type="button" onClick={() => void runCheck(summary.lines, summary.afterReveal)}>
            {summary.check ? "다시 대조" : "원문과 대조"}
          </button>
        )}
        <button type="button" disabled={checking} onClick={() => setEditing(true)}>
          고쳐 쓰기
        </button>
      </div>
    </section>
  )
}
