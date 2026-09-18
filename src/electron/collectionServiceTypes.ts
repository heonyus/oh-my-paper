export type CollectionServiceStatus = {
  readonly state: "ready" | "degraded"
  readonly indexComplete: boolean
  readonly reliabilityWarning: string | null
  readonly missingNoteIds: readonly string[]
  readonly unresolvedConflictIds: readonly string[]
  readonly lastScanAt: string | null
  readonly error: string | null
}

export type CollectionChangeEvent = {
  readonly kind: "notes_reconciled"
  readonly changedNoteIds: readonly string[]
  readonly removedNoteIds: readonly string[]
  readonly scannedAt: string
}

export type CollectionChangeListener = (event: CollectionChangeEvent) => void
