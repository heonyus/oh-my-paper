import type { MemoryRecord, MemoryScope } from "../shared/memorySchemas"
import { sameScope } from "./memoryIpcRegistrationSupport"
import {
  currentMemoryEvidenceRevision,
  type MemorySourceRevisionReader,
} from "./memoryIpcSourceValidation"
import type { MemoryRepository } from "./memoryRepository"

const MISSING_SOURCE_REVISION = "[missing]"

export function refreshMemorySourceValidity(
  repository: MemoryRepository,
  scope: MemoryScope,
  reader: MemorySourceRevisionReader | undefined,
  candidates: readonly MemoryRecord[],
): readonly MemoryRecord[] {
  return candidates.flatMap((record) => {
    if (!sameScope(record.scope, scope) || record.state !== "accepted") return [record]
    invalidateStaleEvidence(repository, record, reader)
    const refreshed = repository.get(record.id)
    return refreshed ? [refreshed] : []
  })
}

function invalidateStaleEvidence(
  repository: MemoryRepository,
  record: MemoryRecord,
  reader: MemorySourceRevisionReader | undefined,
): void {
  record.evidence.forEach((evidence) => {
    const currentRevision = currentMemoryEvidenceRevision(reader, evidence)
    if (currentRevision !== evidence.sourceRevision) {
      repository.invalidateSource(evidence.sourceKey, currentRevision ?? MISSING_SOURCE_REVISION)
    }
  })
}
