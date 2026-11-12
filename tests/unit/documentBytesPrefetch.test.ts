import { afterEach, describe, expect, it, vi } from "vitest"
import {
  prefetchDocumentBytes,
  takeDocumentBytes,
} from "../../src/renderer/lib/documentBytesPrefetch"
import { documentIdSchema } from "../../src/shared/schemas"

const paper = documentIdSchema.parse("aabbccddeeff0011")

function stubReader(read: () => Promise<Uint8Array>) {
  const readDocument = vi.fn(read)
  vi.stubGlobal("ohmypaper", { readDocument })
  return readDocument
}

describe("document bytes read ahead", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("hands the bytes read ahead to the reader once, then reads afresh", async () => {
    const readDocument = stubReader(async () => new Uint8Array([1, 2, 3]))
    prefetchDocumentBytes(paper)
    prefetchDocumentBytes(paper)
    expect(readDocument).toHaveBeenCalledTimes(1)

    await expect(takeDocumentBytes(paper)).resolves.toEqual(new Uint8Array([1, 2, 3]))
    expect(readDocument).toHaveBeenCalledTimes(1)

    await takeDocumentBytes(paper)
    expect(readDocument).toHaveBeenCalledTimes(2)
  })

  it("reads again when the read made ahead failed", async () => {
    let attempt = 0
    const readDocument = stubReader(async () => {
      attempt += 1
      if (attempt === 1) throw new Error("not ready")
      return new Uint8Array([9])
    })
    prefetchDocumentBytes(paper)

    await expect(takeDocumentBytes(paper)).resolves.toEqual(new Uint8Array([9]))
    expect(readDocument).toHaveBeenCalledTimes(2)
  })

  it("lets go of bytes no reader came for", async () => {
    vi.useFakeTimers()
    const readDocument = stubReader(async () => new Uint8Array([1]))
    prefetchDocumentBytes(paper)
    await vi.advanceTimersByTimeAsync(20_000)

    await takeDocumentBytes(paper)
    expect(readDocument).toHaveBeenCalledTimes(2)
  })
})
