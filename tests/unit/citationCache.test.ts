import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CitationLookupCache } from "../../src/electron/citationCache"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("citation lookup cache", () => {
  it("reuses a verified citation result across service instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-citation-cache-"))
    roots.push(root)
    const transport = vi.fn(async () => ({
      statusCode: 200,
      body: JSON.stringify({
        data: [
          {
            paperId: "paper-1",
            title: "A paper about memory",
            authors: [{ name: "Jane Doe" }],
            year: 2024,
          },
        ],
      }),
    }))
    const request = {
      key: "doe-2024",
      title: "A paper about memory",
      authors: "Doe",
      year: 2024,
    } as const

    await new CitationLookupCache(root, transport).lookup(request)
    const cached = await new CitationLookupCache(root, transport).lookup(request)

    expect(cached.status).toBe("found")
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("does not cache provider failures as a negative result", async () => {
    const root = await mkdtemp(join(tmpdir(), "scourgify-citation-cache-"))
    roots.push(root)
    let unavailable = true
    const transport = vi.fn(async () =>
      unavailable
        ? { statusCode: 503, body: "unavailable" }
        : {
            statusCode: 200,
            body: JSON.stringify({
              data: [
                {
                  paperId: "paper-after-retry",
                  title: "Recovered citation",
                  authors: [{ name: "Jane Doe" }],
                  year: 2025,
                },
              ],
            }),
          },
    )
    const request = { key: "retry-2025", title: "Recovered citation" }

    await expect(new CitationLookupCache(root, transport).lookup(request)).rejects.toThrow(
      "Citation lookup incomplete",
    )
    unavailable = false
    await expect(new CitationLookupCache(root, transport).lookup(request)).resolves.toMatchObject({
      status: "found",
    })
  })
})
