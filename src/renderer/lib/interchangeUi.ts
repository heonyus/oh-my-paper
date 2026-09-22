import type { OhMyPaperApi } from "../../shared/ipc"
import type { BoardId, KnowledgeNodeId } from "../../shared/knowledgeSchemas"

type Api = OhMyPaperApi["interchange"]
export type ImportFormat = "markdown" | "canvas" | "experiment" | "zotero"
export type ImportPreview =
  | { readonly kind: "markdown"; readonly value: Awaited<ReturnType<Api["previewMarkdownImport"]>> }
  | { readonly kind: "canvas"; readonly value: Awaited<ReturnType<Api["previewCanvasImport"]>> }
  | {
      readonly kind: "experiment"
      readonly value: Awaited<ReturnType<Api["previewExperimentJsonl"]>>
    }
  | { readonly kind: "zotero"; readonly value: Awaited<ReturnType<Api["previewZoteroFile"]>> }

export async function chooseImport(api: Api, kind: ImportFormat): Promise<ImportPreview | null> {
  const files = await api.chooseFiles({ multiple: kind === "markdown" || kind === "canvas" })
  if (files.length === 0) return null
  const first = files[0]
  if (!first) return null
  switch (kind) {
    case "markdown":
      return { kind, value: await api.previewMarkdownImport(files.map((file) => file.content)) }
    case "canvas": {
      const canvas = files.find((file) => file.name.endsWith(".canvas"))
      const sidecar = files.find((file) => file.name.endsWith(".json"))
      if (!canvas || !sidecar || files.length !== 2)
        throw new Error(".canvas와 함께 저장한 .json 파일을 함께 선택하세요.")
      return { kind, value: await api.previewCanvasImport(canvas.content, sidecar.content) }
    }
    case "experiment":
      if (files.length !== 1) throw new Error("JSONL 파일 하나를 선택하세요.")
      return { kind, value: await api.previewExperimentJsonl(first.content) }
    case "zotero":
      return { kind, value: await api.previewZoteroFile(first.content) }
  }
}

export function previewLines(preview: ImportPreview): readonly string[] {
  const { kind, value } = preview
  switch (kind) {
    case "markdown":
      return [
        ...value.newNodes.map((node) => `새 항목 · ${node.frontMatter.title}`),
        ...value.conflicts.map((node) => `충돌 · ${node.existingTitle}`),
        ...value.parseErrors.map((error) => error.error),
        ...value.duplicateIdsInBatch.map(() => "중복 ID: 저장 불가"),
      ]
    case "canvas":
      return [
        ...value.nodesToPlace.map((node) => `배치 · ${node.title}`),
        ...value.missingNodes.map((id) => `없는 항목 · ${id}`),
      ]
    case "experiment":
      return [
        `집계 실험 ${value.records.length}개`,
        ...value.errors.map((error) => `${error.line}행 · ${error.message}`),
        ...value.sensitiveKeysDetected.map((key) => `민감 필드 · ${key}`),
      ]
    case "zotero":
      return [
        ...value.items.map(
          (item) =>
            `${item.matchType === "external_id_match" ? "기존 항목" : "메타데이터"} · ${item.title}`,
        ),
        ...(value.validationErrors ?? []).map((error) => error.error),
      ]
  }
}

export async function commitImport(
  api: Api,
  preview: ImportPreview,
  boardId: BoardId,
  hypothesisNodeId?: KnowledgeNodeId,
): Promise<void> {
  switch (preview.kind) {
    case "markdown":
      await api.commitMarkdownImport(preview.value.previewId)
      return
    case "canvas":
      await api.commitCanvasImport(preview.value.previewId, boardId)
      return
    case "experiment":
      await api.commitExperiment({
        previewId: preview.value.previewId,
        targetBoardId: boardId,
        ...(hypothesisNodeId ? { hypothesisNodeId } : {}),
      })
      return
    case "zotero":
      await api.commitZotero(preview.value.previewId)
      return
  }
}
