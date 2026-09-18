import { constants } from "node:fs"
import { open } from "node:fs/promises"
import { protocol } from "electron"
import { MAX_ASSET_BYTES } from "../shared/collectionIpc"
import { assetRelativePathSchema } from "../shared/collectionSchemas"
import { imageFormat } from "./collectionAssets"
import { resolveCollectionPath } from "./collectionPaths"

export const collectionAssetScheme = {
  scheme: "scourgify-asset",
  privileges: { standard: true, secure: true, supportFetchAPI: false },
}

export async function readBoundedAsset(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_ASSET_BYTES)
      throw new Error("이미지는 25MB 이하의 일반 파일이어야 합니다.")
    const buffer = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    if (offset !== stat.size) throw new Error("이미지 파일이 변경되었습니다. 다시 선택해 주세요.")
    return buffer.subarray(0, offset)
  } finally {
    await file.close()
  }
}

export function registerCollectionAssetProtocol(
  root: string,
  authorize: () => void | Promise<void>,
): () => void {
  protocol.handle("scourgify-asset", async (request) => {
    try {
      await authorize()
      const url = new URL(request.url)
      if (
        request.method !== "GET" ||
        url.hostname !== "local" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        return new Response(null, { status: 403 })
      const relativePath = assetRelativePathSchema.parse(decodeURIComponent(url.pathname.slice(1)))
      const resolved = await resolveCollectionPath(root, relativePath)
      const bytes = await readBoundedAsset(resolved.path)
      const format = imageFormat(bytes)
      const contentType = format === "jpg" ? "image/jpeg" : `image/${format}`
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
  return () => {
    protocol.unhandle("scourgify-asset")
  }
}
