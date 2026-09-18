import { describe, expect, it, vi } from "vitest"
import { buildSourceDocumentAst } from "../../src/electron/sourceAst"
import { DocumentAstSession } from "../../src/renderer/lib/documentAstSession"
import { documentAstRequestSchema } from "../../src/shared/documentAstIpc"
import { sha256Schema } from "../../src/shared/schemas"

const sourceHash = sha256Schema.parse("a".repeat(64))
const fingerprint = "b".repeat(64)
const request = documentAstRequestSchema.parse({ id: "aabbccddeeff0011", sourceHash, fingerprint })
const idOnlyRequest = documentAstRequestSchema.parse({ id: "aabbccddeeff0011", sourceHash })
const ast = buildSourceDocumentAst(sourceHash, [{ page: 1, width: 600, height: 800, items: [] }])

describe("DocumentAstSession", () => {
  it("deduplicates by source identity and evicts failed loads", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed", reason: "source_unavailable" })
      .mockResolvedValueOnce({ status: "ready", sourceHash, fingerprint, ast })
    const session = new DocumentAstSession(loader)

    expect(await session.load(request)).toBeNull()
    expect(await session.load(request)).toEqual(ast)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("ignores a result that completes after the document generation changes", async () => {
    let finish:
      | ((value: {
          readonly status: "ready"
          readonly sourceHash: typeof sourceHash
          readonly fingerprint: string
          readonly ast: typeof ast
        }) => void)
      | undefined
    const pending = new Promise<{
      readonly status: "ready"
      readonly sourceHash: typeof sourceHash
      readonly fingerprint: string
      readonly ast: typeof ast
    }>((resolve) => {
      finish = resolve
    })
    const loader = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ status: "ready", sourceHash, fingerprint, ast })
    const session = new DocumentAstSession(loader)
    const generation = session.beginGeneration()
    const first = session.load(request, generation)
    session.beginGeneration()
    finish?.({ status: "ready", sourceHash, fingerprint, ast })

    expect(await first).toBeNull()
    expect(await session.load(request)).toEqual(ast)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("loads and deduplicates an id-only request while the service resolves its fingerprint", async () => {
    const loader = vi.fn().mockResolvedValue({ status: "ready", sourceHash, fingerprint, ast })
    const session = new DocumentAstSession(loader)

    expect(await session.load(idOnlyRequest)).toEqual(ast)
    expect(await session.load(idOnlyRequest)).toEqual(ast)
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
