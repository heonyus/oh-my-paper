import { dirname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  assetMarkdown,
  assetPathRelativeToNote,
  imageFormat,
} from "../../../src/electron/collectionAssets"
import { collectionAssetRequestSchema } from "../../../src/shared/collectionIpc"

describe("collection raster asset boundary", () => {
  it("resolves canonical assets from the actual note directory", () => {
    // Given
    const hash = "a".repeat(64)
    const asset = `assets/${hash}.png`

    // When
    const rootNotePath = assetPathRelativeToNote(asset, "notes/root.md")
    const nestedNotePath = assetPathRelativeToNote(asset, "notes/research/inner.md")

    // Then
    expect(rootNotePath).toBe(`../${asset}`)
    expect(nestedNotePath).toBe(`../../${asset}`)
    expect(assetMarkdown(asset, "notes/root.md")).toBe(`![이미지](../${asset})`)
    const noteFile = join("/tmp", "collection", "notes", "research", "inner.md")
    expect(resolve(dirname(noteFile), nestedNotePath)).toBe(join("/tmp", "collection", asset))
    expect(assetMarkdown(asset)).toBe(`![이미지](${asset})`)
  })

  it("rejects traversal and non-collection paths before formatting", () => {
    const hash = "a".repeat(64)
    expect(() => assetPathRelativeToNote(`../assets/${hash}.png`, "notes/root.md")).toThrow()
    expect(() => assetPathRelativeToNote(`assets/${hash}.png`, "../notes/root.md")).toThrow()
  })

  it("accepts bounded raster signatures and rejects active or unknown data", () => {
    expect(imageFormat(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("png")
    expect(imageFormat(Uint8Array.from([255, 216, 255, 224]))).toBe("jpg")
    expect(() => imageFormat(new TextEncoder().encode('<svg onload="alert(1)"/>'))).toThrow()
    expect(() => imageFormat(new Uint8Array(25 * 1024 * 1024 + 1))).toThrow()
  })

  it("permits only bounded asset bytes or the native picker, never arbitrary paths", () => {
    expect(collectionAssetRequestSchema.safeParse({ kind: "pick" }).success).toBe(true)
    expect(
      collectionAssetRequestSchema.safeParse({ kind: "path", path: "/etc/passwd" }).success,
    ).toBe(false)
    expect(
      collectionAssetRequestSchema.safeParse({ kind: "bytes", bytes: new Uint8Array(), name: "x" })
        .success,
    ).toBe(false)
  })
})
