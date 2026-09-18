import { posix } from "node:path"
import { assetRelativePathSchema, noteRelativePathSchema } from "../shared/collectionSchemas"

export function resolveExportAssetPath(source: string, notePath: string): string | null {
  const note = noteRelativePathSchema.safeParse(notePath)
  if (!note.success) return null
  const relativeSource = source.startsWith("scourgify-asset://") ? source.slice(24) : source
  const candidate = relativeSource.startsWith("assets/")
    ? relativeSource
    : posix.normalize(posix.join(posix.dirname(note.data), relativeSource))
  const asset = assetRelativePathSchema.safeParse(candidate)
  return asset.success ? asset.data : null
}
