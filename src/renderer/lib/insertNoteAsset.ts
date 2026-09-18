import { MAX_ASSET_BYTES } from "../../shared/collectionIpc"
import { noteIdSchema } from "../../shared/collectionSchemas"
import type {
  NoteAssetInsertRequest,
  NoteAssetInsertResult,
} from "../components/notes/noteEditorState"

export async function insertNoteAsset(
  request: NoteAssetInsertRequest,
  noteId?: string,
): Promise<NoteAssetInsertResult | null> {
  const api = window.scourgify.collection
  if (!api) throw new Error("이 실행 환경에서는 로컬 이미지를 넣을 수 없습니다.")
  const normalizedNoteId = noteId === undefined ? undefined : noteIdSchema.parse(noteId)
  if (request.kind === "pick") {
    return normalizedNoteId === undefined
      ? api.importAsset({ kind: "pick" })
      : api.importAsset({ kind: "pick", noteId: normalizedNoteId })
  }
  if (request.file.size > MAX_ASSET_BYTES) throw new Error("이미지는 25MB 이하로 선택해 주세요.")
  const bytes = new Uint8Array(await request.file.arrayBuffer())
  return normalizedNoteId === undefined
    ? api.importAsset({ kind: "bytes", name: request.file.name, bytes })
    : api.importAsset({ kind: "bytes", name: request.file.name, bytes, noteId: normalizedNoteId })
}
