import { randomUUID } from "node:crypto"
import type {
  CanvasImportPreview,
  ExperimentImportPreview,
  MarkdownImportPreview,
  ZoteroImportPreview,
} from "../shared/interchangeTypes"

export type ImportPreview =
  | { readonly kind: "markdown"; readonly data: MarkdownImportPreview }
  | { readonly kind: "canvas"; readonly data: CanvasImportPreview }
  | { readonly kind: "experiment"; readonly data: ExperimentImportPreview }
  | { readonly kind: "zotero"; readonly data: ZoteroImportPreview }

export class InterchangePreviewStore {
  private readonly entries = new Map<
    string,
    { readonly owner: number; readonly expires: number; readonly preview: ImportPreview }
  >()

  create(owner: number, preview: ImportPreview): string {
    const id = randomUUID()
    this.entries.set(id, { owner, preview, expires: Date.now() + 300_000 })
    while (this.entries.size > 8) {
      const first = this.entries.keys().next().value
      if (first) this.entries.delete(first)
    }
    return id
  }

  take(owner: number, id: string): ImportPreview {
    const entry = this.entries.get(id)
    if (!entry || entry.owner !== owner || entry.expires < Date.now()) {
      throw new Error("가져오기 미리보기가 만료되었습니다. 파일을 다시 선택하세요.")
    }
    this.entries.delete(id)
    if (!entry.preview.data.isValid) throw new Error("오류가 있는 미리보기는 저장할 수 없습니다.")
    return entry.preview
  }
}
