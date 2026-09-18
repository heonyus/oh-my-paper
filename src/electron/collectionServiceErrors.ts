export class CollectionNoteConflictError extends Error {
  readonly name = "CollectionNoteConflictError"

  constructor(
    readonly conflictId: string | null,
    message = "본문이 다른 곳에서 변경되었습니다. 현재 편집 내용은 유지했습니다.",
  ) {
    super(message)
  }
}
