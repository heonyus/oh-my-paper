import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, open, rename, rm, stat } from "node:fs/promises"
import { dirname, join } from "node:path"

/** Big files are fetched as ranges of this size, so every source can work on one at once. */
const CHUNK = 16 * 1024 * 1024
/** Connections per source for a big file; small files use one each. */
const PER_SOURCE = 4
/** Failed requests before a source is dropped for the file. */
const STRIKES = 3
/** Tries per range across all sources before the download fails. */
const TRIES = 6

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/")
}

/**
 * The same model repository on Hugging Face and ModelScope. From Korea, Hugging Face often
 * serves a cache miss from a US origin at 2–5 MB/s while ModelScope sends ~16 MB/s, so both
 * download at once and the faster one takes more of the work.
 */
export function modelSources(repository, env = process.env) {
  const hf = (env.HF_ENDPOINT ?? "https://huggingface.co").replace(/\/$/, "")
  const modelscope = (env.MODELSCOPE_ENDPOINT ?? "https://modelscope.cn").replace(/\/$/, "")
  return {
    list: [
      async () => {
        const response = await fetch(`${hf}/api/models/${repository}?blobs=true`, {
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error(`huggingface ${response.status}`)
        const body = await response.json()
        return (body.siblings ?? []).map((file) => ({
          path: file.rfilename,
          size: file.size,
          sha256: file.lfs?.sha256 ?? null,
        }))
      },
      async () => {
        const response = await fetch(
          `${modelscope}/api/v1/models/${repository}/repo/files?Recursive=true`,
          { signal: AbortSignal.timeout(15_000) },
        )
        if (!response.ok) throw new Error(`modelscope ${response.status}`)
        const body = await response.json()
        return (body?.Data?.Files ?? [])
          .filter((file) => file.Type !== "tree")
          .map((file) => ({ path: file.Path, size: file.Size, sha256: file.Sha256 || null }))
      },
    ],
    hosts: [
      {
        name: "huggingface",
        url: (path) => `${hf}/${repository}/resolve/main/${encodePath(path)}`,
      },
      {
        name: "modelscope",
        url: (path) => `${modelscope}/models/${repository}/resolve/master/${encodePath(path)}`,
      },
    ],
  }
}

async function listFiles(listers) {
  const errors = []
  for (const list of listers) {
    try {
      const files = await list()
      if (files.length > 0 && files.every((file) => file.path && Number.isInteger(file.size)))
        return files
      errors.push("empty file list")
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(`모델 파일 목록을 받지 못했습니다 (${errors.join(", ")})`)
}

async function sha256Of(path) {
  const hash = createHash("sha256")
  for await (const part of createReadStream(path)) hash.update(part)
  return hash.digest("hex")
}

async function alreadyThere(target, file) {
  try {
    if ((await stat(target)).size !== file.size) return false
  } catch {
    return false
  }
  return !file.sha256 || (await sha256Of(target)) === file.sha256
}

/** One byte range from one host; a short or ignored range throws so another host can take it. */
async function fetchRange(host, path, start, end, onBytes) {
  const response = await fetch(host.url(path), {
    headers: { range: `bytes=${start}-${end}` },
    signal: AbortSignal.timeout(120_000),
  })
  if (response.status !== 206 && !(response.status === 200 && start === 0)) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`${host.name} ${response.status}`)
  }
  const parts = []
  let received = 0
  try {
    for await (const part of response.body) {
      parts.push(part)
      received += part.length
      onBytes(part.length)
    }
  } catch (error) {
    onBytes(-received)
    throw error
  }
  const buffer = Buffer.concat(parts)
  if (buffer.length !== end - start + 1) {
    onBytes(-received)
    throw new Error(`${host.name} sent ${buffer.length} of ${end - start + 1} bytes`)
  }
  return buffer
}

async function downloadFile({ file, directory, hosts, onBytes, served, chunkSize }) {
  const target = join(directory, file.path)
  if (await alreadyThere(target, file)) {
    onBytes(file.size)
    return
  }
  await mkdir(dirname(target), { recursive: true })
  const partial = `${target}.part`
  const handle = await open(partial, "w")
  try {
    const ranges = []
    for (let start = 0; start < file.size; start += chunkSize)
      ranges.push({ start, end: Math.min(file.size, start + chunkSize) - 1, tries: 0 })
    let inFlight = 0
    let fatal = null
    const worker = async (host) => {
      for (;;) {
        if (fatal || host.strikes >= STRIKES) return
        const range = ranges.shift()
        if (!range) {
          // Another worker may still hand a failed range back.
          if (inFlight === 0) return
          await sleep(100)
          continue
        }
        inFlight += 1
        try {
          const buffer = await fetchRange(host, file.path, range.start, range.end, onBytes)
          await handle.write(buffer, 0, buffer.length, range.start)
          served[host.name] = (served[host.name] ?? 0) + buffer.length
        } catch (error) {
          host.strikes += 1
          range.tries += 1
          if (range.tries >= TRIES) fatal = error
          else ranges.push(range)
        } finally {
          inFlight -= 1
        }
      }
    }
    // Strikes are per host, and workers alternate hosts so the first ranges go to both.
    const tracked = hosts.map((host) => ({ ...host, strikes: 0 }))
    const perHost = file.size > chunkSize ? PER_SOURCE : 1
    await Promise.all(
      Array.from({ length: perHost }).flatMap(() => tracked.map((host) => worker(host))),
    )
    if (fatal || ranges.length > 0) {
      const reason = fatal instanceof Error ? fatal.message : "every host failed"
      throw new Error(`${file.path}을(를) 받지 못했습니다 (${reason})`)
    }
  } finally {
    await handle.close()
  }
  if (file.sha256 && (await sha256Of(partial)) !== file.sha256) {
    await rm(partial, { force: true })
    throw new Error(`${file.path} 체크섬이 맞지 않습니다`)
  }
  await rename(partial, target)
}

/**
 * Downloads every file of a model repository into `directory` from all hosts at once, skipping
 * files already there and checking each file's SHA-256 when the host lists one. `onTotal` gets
 * the repository size once known, `onBytes` every received byte (negative when a range is
 * discarded). Resolves with the bytes each host served.
 */
export async function downloadRepository({
  sources,
  directory,
  onTotal,
  onBytes,
  chunkSize = CHUNK,
}) {
  const files = await listFiles(sources.list)
  onTotal(files.reduce((sum, file) => sum + file.size, 0))
  const served = {}
  const fetchFile = (file) =>
    downloadFile({ file, directory, hosts: sources.hosts, onBytes, served, chunkSize })
  const pool = files.filter((file) => file.size <= chunkSize)
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let file = pool.shift(); file; file = pool.shift()) await fetchFile(file)
    }),
  )
  for (const file of files.filter((candidate) => candidate.size > chunkSize)) await fetchFile(file)
  return served
}
