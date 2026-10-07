import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createNoteAssetRoute } from "../../src/server/noteAssetRoute"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
)

describe("note asset route", () => {
  let root: string
  let server: Server
  let base: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ohmypaper-note-assets-"))
    const route = createNoteAssetRoute({ store: { root } })
    server = createServer((request, response) => {
      void route
        .handle(new URL(request.url ?? "/", "http://x").pathname, request, response)
        .then((handled) => {
          if (!handled) response.writeHead(404).end()
        })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })

  it("keeps an image once under its hash beside the notes and serves it back", async () => {
    const first = await fetch(`${base}/api/note-assets`, { method: "POST", body: PNG })
    const second = await fetch(`${base}/api/note-assets`, { method: "POST", body: PNG })
    const { relativePath } = (await first.json()) as { relativePath: string }

    expect(first.status).toBe(200)
    expect(await second.json()).toEqual({ relativePath })
    expect(relativePath).toMatch(/^assets\/[a-f0-9]{64}\.png$/u)
    expect(await readFile(join(root, relativePath))).toEqual(PNG)

    const served = await fetch(`${base}/api/note-${relativePath}`)
    expect(served.headers.get("content-type")).toBe("image/png")
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG)
  })

  it("refuses what is not an image and paths outside the folder", async () => {
    const text = await fetch(`${base}/api/note-assets`, { method: "POST", body: "hello" })
    expect(text.status).toBe(415)
    expect((await fetch(`${base}/api/note-assets/..%2Fsecret.png`)).status).toBe(404)
    expect((await fetch(`${base}/api/note-assets/${"a".repeat(64)}.png`)).status).toBe(404)
  })
})
