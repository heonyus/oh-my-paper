import { describe, expect, it, vi } from "vitest"
import { createTaskQueue } from "../../src/renderer/lib/taskQueue"
import { createThumbnailCache, type Thumbnail } from "../../src/renderer/lib/thumbnailCache"
import { createThumbnailLoader, type ThumbnailSource } from "../../src/renderer/lib/thumbnailLoader"
import type { ThumbnailStorage } from "../../src/renderer/lib/thumbnailStorage"
import { documentIdSchema } from "../../src/shared/schemas"
import {
  failingThumbnailStorage,
  fakeThumbnailStorage,
  hashOf,
  thumbnailOf,
} from "../support/fakeThumbnailStorage"

function sourceOf(seed: string): ThumbnailSource {
  return { id: documentIdSchema.parse(seed.repeat(16)), hash: hashOf(seed) }
}

type PendingRender = {
  readonly source: ThumbnailSource
  readonly signal: AbortSignal
  readonly finish: (thumbnail: Thumbnail) => void
  readonly fail: (error: Error) => void
}

function harness(storage: ThumbnailStorage | null = null) {
  const renders: PendingRender[] = []
  const render = vi.fn(
    (source: ThumbnailSource, signal: AbortSignal) =>
      new Promise<Thumbnail>((finish, fail) => {
        renders.push({ source, signal, finish, fail })
      }),
  )
  const cache = createThumbnailCache({
    storage,
    memoryLimit: 50,
    persistedLimit: 50,
    now: () => 1,
  })
  const loader = createThumbnailLoader({ cache, queue: createTaskQueue(2), render })
  return { loader, render, renders }
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
}

describe("thumbnail loader", () => {
  it("renders at most two papers at once and cancels queued work that is no longer shown", async () => {
    const { loader, render, renders } = harness()
    const rows = ["a", "b", "c", "d"].map((seed) => ({ seed, controller: new AbortController() }))
    const requests = rows.map(({ seed, controller }) =>
      loader.request(sourceOf(seed), controller.signal),
    )
    for (const request of requests) request.catch(() => undefined)
    await flush()
    expect(render).toHaveBeenCalledTimes(2)

    rows[2]?.controller.abort()
    await expect(requests[2]).rejects.toMatchObject({ name: "AbortError" })
    renders[0]?.finish(thumbnailOf("a"))
    await flush()

    expect(render.mock.calls.map(([source]) => source.hash)).toEqual([
      hashOf("a"),
      hashOf("b"),
      hashOf("d"),
    ])
    expect(await requests[0]).toMatchObject({ density: 2 })
  })

  it("shares one render between thumbnails of the same content and aborts it when all leave", async () => {
    const { loader, render, renders } = harness()
    const first = new AbortController()
    const second = new AbortController()
    const one = loader.request(sourceOf("a"), first.signal)
    const two = loader.request(sourceOf("a"), second.signal)
    one.catch(() => undefined)
    two.catch(() => undefined)
    await flush()
    expect(render).toHaveBeenCalledTimes(1)

    first.abort()
    await flush()
    expect(renders[0]?.signal.aborted).toBe(false)
    second.abort()
    await flush()
    expect(renders[0]?.signal.aborted).toBe(true)
  })

  it("serves a stored thumbnail without rendering and reuses it from memory", async () => {
    const storage = fakeThumbnailStorage()
    await createThumbnailCache({
      storage,
      memoryLimit: 5,
      persistedLimit: 5,
      now: () => 1,
    }).save(hashOf("a"), thumbnailOf("a"))
    const { loader, render } = harness(storage)

    expect(await loader.request(sourceOf("a"), new AbortController().signal)).not.toBeNull()
    expect(loader.peek(hashOf("a"))).not.toBeNull()
    expect(render).not.toHaveBeenCalled()
  })

  it("falls back to rendering when storage fails and remembers papers that cannot render", async () => {
    const { loader, render, renders } = harness(failingThumbnailStorage())

    const rendered = loader.request(sourceOf("a"), new AbortController().signal)
    await flush()
    renders[0]?.finish(thumbnailOf("a"))
    expect(await rendered).not.toBeNull()

    const broken = loader.request(sourceOf("b"), new AbortController().signal)
    await flush()
    renders[1]?.fail(new Error("encrypted"))
    expect(await broken).toBeNull()
    expect(await loader.request(sourceOf("b"), new AbortController().signal)).toBeNull()
    expect(render).toHaveBeenCalledTimes(2)
  })
})
