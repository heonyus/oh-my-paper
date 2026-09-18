import { posix } from "node:path"
import { MAX_ASSET_BYTES } from "../shared/collectionIpc"
import { assetRelativePathSchema, noteRelativePathSchema } from "../shared/collectionSchemas"

export function imageFormat(bytes: Uint8Array): "png" | "jpg" | "webp" {
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES)
    throw new Error("이미지는 25MB 이하로 선택해 주세요.")
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value))
    return "png"
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg"
  if (
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  )
    return "webp"
  throw new Error("PNG, JPEG, WebP 이미지만 넣을 수 있습니다.")
}

export function assetPathRelativeToNote(
  assetRelativePath: string,
  noteRelativePath: string,
): string {
  const assetPath = assetRelativePathSchema.parse(assetRelativePath)
  const notePath = noteRelativePathSchema.parse(noteRelativePath)
  return posix.relative(posix.dirname(notePath), assetPath)
}

export function assetMarkdown(relativePath: string, noteRelativePath?: string): string {
  const source =
    noteRelativePath === undefined
      ? assetRelativePathSchema.parse(relativePath)
      : assetPathRelativeToNote(relativePath, noteRelativePath)
  return `![이미지](${source})`
}
