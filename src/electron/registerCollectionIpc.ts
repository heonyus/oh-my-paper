import { dialog, ipcMain, nativeImage, shell } from "electron"
import {
  collectionAssetRequestSchema,
  collectionAssetResultSchema,
  collectionChannels,
  collectionStatusSchema,
  noteConflictRequestSchema,
  noteConflictResolveSchema,
  noteConflictResultSchema,
  noteHistoryRequestSchema,
  noteHistoryResultSchema,
  noteRestoreRequestSchema,
  noteSnapshotBodySchema,
  noteSnapshotRequestSchema,
} from "../shared/collectionIpc"
import { knowledgeNodeIdSchema } from "../shared/knowledgeSchemas"
import { readBoundedAsset } from "./collectionAssetProtocol"
import { assetMarkdown, imageFormat } from "./collectionAssets"
import { readCanonicalNoteBody } from "./collectionFrontmatter"
import type { CollectionService } from "./collectionService"

export function registerCollectionIpc(
  service: CollectionService,
  onChanged: () => void,
): () => void {
  ipcMain.handle(collectionChannels.status, async () =>
    collectionStatusSchema.parse(await service.status()),
  )
  ipcMain.handle(collectionChannels.reveal, async () => {
    const error = await shell.openPath(service.files.root)
    if (error) throw new Error(error)
  })
  ipcMain.handle(collectionChannels.assetImport, async (_event, value: unknown) => {
    const request = collectionAssetRequestSchema.parse(value)
    let noteRelativePath: string | undefined
    if (request.noteId !== undefined) {
      await service.rescan()
      const note = service.index.get(request.noteId)
      if (!note) throw new Error("노트 원본 파일을 찾을 수 없습니다.")
      noteRelativePath = note.relativePath
    }
    let bytes: Uint8Array
    if (request.kind === "pick") {
      const selection = await dialog.showOpenDialog({
        title: "노트에 이미지 넣기",
        properties: ["openFile"],
        filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "webp"] }],
      })
      const path = selection.filePaths[0]
      if (selection.canceled || !path) return null
      bytes = await readBoundedAsset(path)
    } else bytes = request.bytes
    const extension = imageFormat(bytes)
    const image = nativeImage.createFromBuffer(Buffer.from(bytes))
    const { width, height } = image.getSize()
    if (image.isEmpty() || width * height > 32_000_000)
      throw new Error(
        "이미지를 읽을 수 없거나 해상도가 너무 큽니다. 3,200만 화소 이하로 선택해 주세요.",
      )
    const saved = await service.writeAsset(bytes, extension)
    return collectionAssetResultSchema.parse({
      ...saved,
      markdownSource: assetMarkdown(saved.relativePath, noteRelativePath),
    })
  })
  ipcMain.handle(collectionChannels.history, async (_event, value: unknown) => {
    const { noteId } = noteHistoryRequestSchema.parse(value)
    await service.rescan()
    const note = service.index.get(noteId)
    if (!note) throw new Error("노트 원본 파일을 찾을 수 없습니다.")
    return noteHistoryResultSchema.parse({
      noteId,
      relativePath: note.relativePath,
      currentRevision: note.revision,
      snapshots: await service.files.history.listSnapshots(noteId),
      conflicts: (await service.files.history.listConflicts()).filter(
        (conflict) => conflict.noteId === noteId && conflict.status === "unresolved",
      ),
    })
  })
  ipcMain.handle(collectionChannels.preview, async (_event, value: unknown) => {
    const { noteId, snapshotId } = noteSnapshotRequestSchema.parse(value)
    return noteSnapshotBodySchema.parse(
      readCanonicalNoteBody(await service.files.history.readSnapshot(noteId, snapshotId)),
    )
  })
  ipcMain.handle(collectionChannels.restore, async (_event, value: unknown) => {
    const request = noteRestoreRequestSchema.parse(value)
    await service.restore(request.noteId, request.snapshotId, request.expectedRevision)
    onChanged()
  })
  ipcMain.handle(collectionChannels.conflict, async (_event, value: unknown) => {
    const { conflictId } = noteConflictRequestSchema.parse(value)
    const result = await service.files.history.readConflict(conflictId)
    const current = await service.files.readNote(result.metadata.relativePath)
    return noteConflictResultSchema.parse({
      metadata: result.metadata,
      currentRevision: current.revision,
      currentBody: readCanonicalNoteBody(current.bytes),
      incomingBody: readCanonicalNoteBody(result.incomingBytes),
    })
  })
  ipcMain.handle(collectionChannels.resolve, async (_event, value: unknown) => {
    const request = noteConflictResolveSchema.parse(value)
    const retained = await service.files.history.readConflict(request.conflictId)
    if (retained.metadata.status !== "unresolved") throw new Error("이미 해결된 충돌입니다.")
    const current = await service.files.readNote(retained.metadata.relativePath)
    if (current.revision !== request.expectedRevision)
      throw new Error("노트가 다시 변경되었습니다. 최신 원본을 확인해 주세요.")
    await service.updateNode({
      id: knowledgeNodeIdSchema.parse(current.noteId),
      expectedBody: readCanonicalNoteBody(current.bytes),
      body: request.body,
    })
    await service.files.history.resolveConflict(request.conflictId)
    onChanged()
  })
  return () => {
    for (const channel of Object.values(collectionChannels)) ipcMain.removeHandler(channel)
  }
}
