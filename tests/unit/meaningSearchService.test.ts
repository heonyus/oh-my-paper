import { describe, expect, it, vi } from "vitest"
import { type Embedder, MeaningSearchService } from "../../src/server/meaningSearchService"

/** Embeds each text as a 2-d direction chosen by keyword, like a tiny multilingual model. */
function fakeEmbedder(): Embedder & { readonly calls: string[][] } {
  const calls: string[][] = []
  const embed = async (texts: readonly string[]) => {
    calls.push([...texts])
    return texts.map((text) =>
      /translation|번역/u.test(text) ? [1, 0] : /recall|기억/u.test(text) ? [0, 1] : [0.6, 0.8],
    )
  }
  return Object.assign(embed, { calls })
}

describe("MeaningSearchService", () => {
  it("ranks passages by meaning and reuses passage vectors", async () => {
    const embedder = fakeEmbedder()
    const load = vi.fn(async () => embedder)
    const service = new MeaningSearchService("/tmp/unused", load)
    const request = {
      query: "번역을 먼저 본다",
      candidates: [
        { id: "a", text: "Readers recall less." },
        { id: "b", text: "Readers skim the translation." },
      ],
      limit: 2,
    }

    const first = await service.rank(request)
    await service.rank(request)

    expect(first.results.map((result) => result.id)).toEqual(["b", "a"])
    expect(first.results[0]?.score).toBeCloseTo(1)
    expect(load).toHaveBeenCalledOnce()
    const passageCalls = embedder.calls.filter((texts) =>
      texts.some((text) => text.startsWith("Readers")),
    )
    expect(passageCalls).toHaveLength(1)
    expect(service.state()).toBe("ready")
  })

  it("reports a failed model load and tries again later", async () => {
    const load = vi
      .fn<(directory: string) => Promise<Embedder>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(fakeEmbedder())
    const service = new MeaningSearchService("/tmp/unused", load)
    const request = { query: "기억", candidates: [{ id: "a", text: "recall" }] }

    await expect(service.rank(request)).rejects.toThrow("offline")
    expect(service.state()).toBe("failed")
    expect((await service.rank(request)).results[0]?.id).toBe("a")
  })
})
