// @vitest-environment node
import { createHash, randomBytes } from "node:crypto"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
// @ts-expect-error -- a plain .mjs script without type declarations
import { downloadRepository, modelSources } from "../../scripts/model-download.mjs"

const REPO = "Org/Model-1"
const CHUNK = 64 * 1024

type Behaviour = {
  hfList?: "ok" | "fail"
  hfRanges?: "ok" | "fail"
  msRanges?: "ok" | "fail"
  corrupt?: boolean
}

function sha(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

/** One server playing both hosts: /hf like Hugging Face and /ms like ModelScope. */
async function fakeHosts(files: Record<string, Buffer>, behaviour: Behaviour) {
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local")
    requests.push(`${url.pathname}${req.headers.range ? ` ${req.headers.range}` : ""}`)
    if (url.pathname === `/hf/api/models/${REPO}`) {
      if (behaviour.hfList === "fail") return void res.writeHead(503).end()
      const siblings = Object.entries(files).map(([path, data]) => ({
        rfilename: path,
        size: data.length,
        ...(data.length > 1024 ? { lfs: { sha256: sha(data) } } : {}),
      }))
      return void res.end(JSON.stringify({ siblings }))
    }
    if (url.pathname === `/ms/api/v1/models/${REPO}/repo/files`) {
      const list = Object.entries(files).map(([path, data]) => ({
        Path: path,
        Size: data.length,
        Sha256: sha(data),
        Type: "blob",
      }))
      return void res.end(JSON.stringify({ Data: { Files: list } }))
    }
    const hf = url.pathname.startsWith(`/hf/${REPO}/resolve/main/`)
    const ms = url.pathname.startsWith(`/ms/models/${REPO}/resolve/master/`)
    if (!hf && !ms) return void res.writeHead(404).end()
    if ((hf && behaviour.hfRanges === "fail") || (ms && behaviour.msRanges === "fail"))
      return void res.writeHead(500).end()
    const path = decodeURIComponent(url.pathname.split(/\/resolve\/(?:main|master)\//)[1] ?? "")
    const data = files[path]
    if (!data) return void res.writeHead(404).end()
    const match = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? "")
    const start = match ? Number(match[1]) : 0
    const end = match ? Number(match[2]) : data.length - 1
    let body = data.subarray(start, end + 1)
    if (behaviour.corrupt) body = Buffer.from(body.map((byte) => byte ^ 0xff))
    res.writeHead(match ? 206 : 200, { "content-length": body.length })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("no address")
  const base = `http://127.0.0.1:${address.port}`
  return {
    requests,
    env: { HF_ENDPOINT: `${base}/hf`, MODELSCOPE_ENDPOINT: `${base}/ms` },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe("model download", () => {
  let directory = ""
  const files = {
    "config.json": Buffer.from('{"model_type":"test"}'),
    "model.safetensors": randomBytes(CHUNK * 12 + 1234),
  }
  const total = Object.values(files).reduce((sum, data) => sum + data.length, 0)

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "ohmypaper-model-"))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function download(behaviour: Behaviour) {
    const hosts = await fakeHosts(files, behaviour)
    let bytes = 0
    let announced = 0
    try {
      const served = await downloadRepository({
        sources: modelSources(REPO, hosts.env),
        directory,
        chunkSize: CHUNK,
        onTotal: (value: number) => {
          announced = value
        },
        onBytes: (count: number) => {
          bytes += count
        },
      })
      return { served: served as Record<string, number>, bytes, announced, hosts }
    } finally {
      await hosts.close()
    }
  }

  it("downloads every file in ranges from both hosts at once", async () => {
    const { served, bytes, announced } = await download({})

    for (const [path, data] of Object.entries(files))
      expect(await readFile(join(directory, path))).toEqual(data)
    expect(announced).toBe(total)
    expect(bytes).toBe(total)
    expect(served["huggingface"]).toBeGreaterThan(0)
    expect(served["modelscope"]).toBeGreaterThan(0)
    await expect(stat(join(directory, "model.safetensors.part"))).rejects.toThrow()
  })

  it("finishes from the other host when one fails every range", async () => {
    const { served, bytes } = await download({ hfRanges: "fail" })

    expect(await readFile(join(directory, "model.safetensors"))).toEqual(files["model.safetensors"])
    expect(served["huggingface"]).toBeUndefined()
    expect(served["modelscope"]).toBe(total)
    expect(bytes).toBe(total)
  })

  it("uses ModelScope's file list when Hugging Face cannot answer", async () => {
    await download({ hfList: "fail" })
    expect(await readFile(join(directory, "config.json"))).toEqual(files["config.json"])
  })

  it("rejects a file whose checksum does not match and leaves nothing behind", async () => {
    await expect(download({ corrupt: true })).rejects.toThrow(/체크섬/)
    await expect(stat(join(directory, "model.safetensors"))).rejects.toThrow()
    await expect(stat(join(directory, "model.safetensors.part"))).rejects.toThrow()
  })

  it("skips files already downloaded intact", async () => {
    await writeFile(join(directory, "model.safetensors"), files["model.safetensors"])
    const { hosts, bytes } = await download({})

    expect(hosts.requests.some((line) => line.includes("model.safetensors"))).toBe(false)
    expect(bytes).toBe(total)
  })
})
