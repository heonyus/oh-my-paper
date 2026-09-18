import { type FormEvent, type JSX, useEffect, useState } from "react"
import type { BibliographyApi } from "../../../shared/bibliographyIpc"
import {
  type BibliographyDuplicateCandidate,
  type BibliographyExportResult,
  type BibliographyPaper,
  type BibliographyUpdateInput,
  bibliographyUpdateInputSchema,
} from "../../../shared/bibliographySchemas"
import "./bibliography.css"

export interface PaperBibliographyPanelProps {
  readonly paper: BibliographyPaper
  readonly onSave: BibliographyApi["updatePaper"]
  readonly onPreviewDuplicates: BibliographyApi["previewDuplicates"]
  readonly onExportBibtex: BibliographyApi["exportBibtex"]
}

type FormState = {
  readonly title: string
  readonly authors: string
  readonly year: string
  readonly doi: string
  readonly arxivId: string
  readonly venue: string
  readonly tags: string
  readonly readingState: "unread" | "reading" | "read"
}

type SaveState =
  | { readonly kind: "idle" | "saving" | "saved" }
  | { readonly kind: "duplicates"; readonly candidates: readonly BibliographyDuplicateCandidate[] }
  | { readonly kind: "error"; readonly message: string }

function formFrom(paper: BibliographyPaper): FormState {
  return {
    title: paper.node.title,
    authors: paper.metadata.authors.join("\n"),
    year: paper.metadata.year?.toString() ?? "",
    doi: paper.metadata.doi ?? "",
    arxivId: paper.metadata.arxivId ?? "",
    venue: paper.metadata.venue,
    tags: paper.metadata.tags.join(", "),
    readingState: paper.metadata.readingState,
  }
}

function updateInput(paper: BibliographyPaper, form: FormState): BibliographyUpdateInput {
  return bibliographyUpdateInputSchema.parse({
    paperNodeId: paper.node.id,
    title: form.title,
    authors: form.authors
      .split(/[\n,]/u)
      .map((value) => value.trim())
      .filter(Boolean),
    year: form.year.trim() ? Number(form.year) : null,
    doi: form.doi.trim() || null,
    arxivId: form.arxivId.trim() || null,
    venue: form.venue,
    tags: form.tags
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    readingState: form.readingState,
  })
}

export function PaperBibliographyPanel({
  paper,
  onSave,
  onPreviewDuplicates,
  onExportBibtex,
}: PaperBibliographyPanelProps): JSX.Element {
  const [form, setForm] = useState(() => formFrom(paper))
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const [exported, setExported] = useState<BibliographyExportResult | null>(null)

  useEffect(() => {
    setForm(formFrom(paper))
    setSaveState({ kind: "idle" })
    setExported(null)
  }, [paper])

  async function save(reviewed: boolean): Promise<void> {
    setSaveState({ kind: "saving" })
    try {
      const input = updateInput(paper, form)
      if (!reviewed) {
        const preview = await onPreviewDuplicates({
          paperNodeId: input.paperNodeId,
          doi: input.doi,
          arxivId: input.arxivId,
        })
        if (preview.candidates.length) {
          setSaveState({ kind: "duplicates", candidates: preview.candidates })
          return
        }
      }
      const saved = await onSave(input)
      setForm(formFrom(saved))
      setSaveState({ kind: "saved" })
    } catch (cause) {
      setSaveState({
        kind: "error",
        message: cause instanceof Error ? cause.message : "서지 정보를 저장하지 못했습니다.",
      })
    }
  }

  async function exportBibtex(): Promise<void> {
    try {
      setExported(await onExportBibtex({ paperNodeIds: [paper.node.id] }))
    } catch (cause) {
      setSaveState({
        kind: "error",
        message: cause instanceof Error ? cause.message : "BibTeX를 만들지 못했습니다.",
      })
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void save(false)
  }

  return (
    <section className="bibliography-panel" aria-labelledby="bibliography-heading">
      <header>
        <div>
          <h2 id="bibliography-heading">서지 정보</h2>
          <p>
            인용 키: <code>{paper.metadata.citationKey}</code>
          </p>
        </div>
        <button type="button" onClick={() => void exportBibtex()}>
          BibTeX 만들기
        </button>
      </header>
      <form onSubmit={submit}>
        <label>
          제목
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>
        <label>
          저자
          <textarea
            value={form.authors}
            onChange={(event) => setForm({ ...form, authors: event.target.value })}
          />
        </label>
        <div className="bibliography-row">
          <label>
            연도
            <input
              inputMode="numeric"
              value={form.year}
              onChange={(event) => setForm({ ...form, year: event.target.value })}
            />
          </label>
          <label>
            읽기 상태
            <select
              value={form.readingState}
              onChange={(event) =>
                setForm({
                  ...form,
                  readingState:
                    event.target.value === "read"
                      ? "read"
                      : event.target.value === "reading"
                        ? "reading"
                        : "unread",
                })
              }
            >
              <option value="unread">읽지 않음</option>
              <option value="reading">읽는 중</option>
              <option value="read">읽음</option>
            </select>
          </label>
        </div>
        <label>
          DOI
          <input
            value={form.doi}
            onChange={(event) => setForm({ ...form, doi: event.target.value })}
          />
        </label>
        <label>
          arXiv
          <input
            value={form.arxivId}
            onChange={(event) => setForm({ ...form, arxivId: event.target.value })}
          />
        </label>
        <label>
          학술지·학회
          <input
            value={form.venue}
            onChange={(event) => setForm({ ...form, venue: event.target.value })}
          />
        </label>
        <label>
          태그
          <input
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder="쉼표로 구분"
          />
        </label>
        <p className="bibliography-help">저장해도 PDF 문서 버전과 원문 위치는 바뀌지 않습니다.</p>
        {saveState.kind === "duplicates" ? (
          <aside className="bibliography-duplicates" aria-label="중복 후보">
            <strong>같은 식별자를 사용하는 논문이 있습니다.</strong>
            <ul>
              {saveState.candidates.map((candidate) => (
                <li key={candidate.paperNodeId}>
                  {candidate.title} · {candidate.reasons.join(", ")}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => void save(true)}>
              중복을 유지하고 저장
            </button>
          </aside>
        ) : null}
        {saveState.kind === "error" ? (
          <p className="bibliography-error" role="alert">
            {saveState.message}
          </p>
        ) : null}
        {saveState.kind === "saved" ? <p role="status">저장됨</p> : null}
        <button className="bibliography-save" type="submit" disabled={saveState.kind === "saving"}>
          서지 정보 저장
        </button>
      </form>
      {exported ? (
        <section aria-label="BibTeX 결과">
          <pre>{exported.content}</pre>
        </section>
      ) : null}
    </section>
  )
}
