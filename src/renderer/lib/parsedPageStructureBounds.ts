import type { SourceFragment } from "../../shared/schemas"
import type { DetectedStructure } from "./structureDetector"

export function refineParsedStructureBounds(
  structures: readonly DetectedStructure[],
  refine: (bounds: SourceFragment) => SourceFragment,
): readonly DetectedStructure[] {
  return structures.map((structure) =>
    structure.kind === "figure" || structure.kind === "table"
      ? { ...structure, bounds: refine(structure.bounds) }
      : structure,
  )
}
