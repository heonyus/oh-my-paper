import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import { dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"

import { CollectionFiles, initializeCollection } from "../src/electron/collectionFiles"
import { createCanonicalNoteBytes } from "../src/electron/collectionFrontmatter"
import { CollectionIndex } from "../src/electron/collectionIndex"
import { CollectionService } from "../src/electron/collectionService"

const MAX_TEMP_BYTES = 256 * 1024 * 1024
const FIXTURE_RELATIVE_PATH = "tests/fixtures/document-ast/structured-document.pdf"
const HELP =
  "Usage: npx tsx scripts/benchmark-local-product.ts [options]\n\nOptions:\n  --tier <smoke|routine|stress>  Workload tier (default: routine)\n  --output <path>                Write JSON here\n  --help                         Show this help\n\nSynthetic-only: smoke=100/10, routine=1,000/100, stress=10,000/100 notes/PDFs.\nNo automatic 100k tier. Timings are index service timings, not UI latency.\n"

type Tier = "smoke" | "routine" | "stress"
type TierConfig = Readonly<{ notes: number; pdfs: number; searches: number }>
const TIERS: Record<Tier, TierConfig> = {
  smoke: { notes: 100, pdfs: 10, searches: 20 },
  routine: { notes: 1_000, pdfs: 100, searches: 50 },
  stress: { notes: 10_000, pdfs: 100, searches: 50 },
}

function parseArgs(
  argv: readonly string[],
): Readonly<{ tier: Tier; output: string | null }> | null {
  if (argv.includes("--help")) return null
  const tierIndex = argv.indexOf("--tier")
  const tierArgument = argv.find((argument) => argument.startsWith("--tier="))
  const tierValue =
    tierArgument?.slice("--tier=".length) ?? (tierIndex >= 0 ? argv[tierIndex + 1] : "routine")
  if (tierValue !== "smoke" && tierValue !== "routine" && tierValue !== "stress")
    throw new Error(`Unsupported tier: ${tierValue ?? "missing"}`)
  const outputIndex = argv.indexOf("--output")
  const outputArgument = argv.find((argument) => argument.startsWith("--output="))
  const output =
    outputArgument?.slice("--output=".length) ?? (outputIndex >= 0 ? argv[outputIndex + 1] : null)
  if (outputIndex >= 0 && !output) throw new Error("--output requires a path")
  return { tier: tierValue, output }
}

async function directoryBytes(directory: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) total += await directoryBytes(path)
    else if (entry.isFile()) total += (await stat(path)).size
  }
  return total
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function gitSnapshot(repoRoot: string) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).toString().trim()
  const diff = execFileSync("git", ["diff", "--binary", "HEAD", "--"], {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  })
  return { head, diff }
}

function summarize(samples: readonly number[]) {
  const sorted = [...samples].sort((left, right) => left - right)
  const percentile = (fraction: number) =>
    Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(3))
  return {
    samples: samples.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
  }
}

async function writeSyntheticNotes(
  root: string,
  count: number,
  checkBudget: () => Promise<void>,
): Promise<void> {
  await mkdir(join(root, "notes", "nested"), { recursive: true })
  for (let index = 0; index < count; index += 1) {
    const noteId = randomUUID()
    const pathPrefix = index % 5 === 0 ? "notes/nested" : "notes"
    await writeFile(
      join(root, pathPrefix, `${noteId}.md`),
      createCanonicalNoteBytes(
        noteId,
        `# Synthetic note ${index}\n\nbenchmarkterm cohort${index % 10}.`,
      ),
      { flag: "wx" },
    )
    if (index % 100 === 99 || index === count - 1) await checkBudget()
  }
}

async function writeManagedFixtureCopies(root: string, count: number, repoRoot: string) {
  const source = join(repoRoot, FIXTURE_RELATIVE_PATH)
  const sourceBytes = (await stat(source)).size
  const plannedBytes = (await directoryBytes(root)) + sourceBytes * count
  if (plannedBytes > MAX_TEMP_BYTES)
    throw new Error(`Synthetic benchmark preflight exceeds ${MAX_TEMP_BYTES} byte temp-disk limit`)
  for (let index = 0; index < count; index += 1)
    await copyFile(
      source,
      join(root, "papers", `synthetic-fixture-${String(index).padStart(3, "0")}.pdf`),
    )
  return { bytes: sourceBytes * count, copies: count }
}

async function measureSearch(indexPath: string, iterations: number) {
  const cold: number[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now()
    const index = new CollectionIndex(indexPath)
    const matches = index.searchIds("benchmarkterm", 100)
    index.close()
    if (matches.length === 0) throw new Error("Synthetic search returned no notes")
    cold.push(performance.now() - started)
  }
  const index = new CollectionIndex(indexPath)
  index.searchIds("benchmarkterm", 100)
  const warm: number[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now()
    const matches = index.searchIds("benchmarkterm", 100)
    if (matches.length === 0) throw new Error("Warm synthetic search returned no notes")
    warm.push(performance.now() - started)
  }
  index.close()
  return { cold: summarize(cold), warm: summarize(warm) }
}

async function measureCancellation() {
  const root = await mkdtemp(join(os.tmpdir(), "scourgify-benchmark-cancel-"))
  const controller = new AbortController()
  let files: CollectionFiles | null = null
  let writes = 0
  let observedAt = 0
  let requestedAt = 0
  let cleanupMs = 0
  try {
    await initializeCollection(root, randomUUID())
    await mkdir(join(root, "notes", "nested"), { recursive: true })
    files = await CollectionFiles.open(root)
    for (let index = 0; index < 64; index += 1) {
      if (controller.signal.aborted) throw new Error("benchmark cancellation observed")
      const noteId = randomUUID()
      const result = await files.saveNote({
        relativePath: `notes/nested/${noteId}.md`,
        bytes: createCanonicalNoteBytes(noteId, `# Cancel ${index}`),
        expectedRevision: null,
        reason: "explicit_save",
      })
      if (result.kind !== "saved") throw new Error("Cancellation fixture write failed")
      writes += 1
      if (writes === 16) {
        requestedAt = performance.now()
        controller.abort()
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "benchmark cancellation observed")
      throw error
    observedAt = performance.now()
  } finally {
    const closeStarted = performance.now()
    if (files) await files.close()
    await rm(root, { recursive: true, force: true })
    cleanupMs = performance.now() - closeStarted
  }
  if (!observedAt || !requestedAt) throw new Error("Cancellation was not observed")
  return {
    observedMs: Number((observedAt - requestedAt).toFixed(3)),
    cleanupMs: Number(cleanupMs.toFixed(3)),
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) {
    process.stdout.write(HELP)
    return
  }
  const repoRoot = process.cwd()
  const git = gitSnapshot(repoRoot)
  const sourceDigest = digest(await readFile(join(repoRoot, "scripts/benchmark-local-product.ts")))
  const diffDigest = digest(git.diff)
  const tier = TIERS[options.tier]
  const root = await mkdtemp(join(os.tmpdir(), "scourgify-benchmark-"))
  let cleaned = false
  try {
    let peakBytes = 0
    const checkBudget = async (): Promise<void> => {
      const bytes = await directoryBytes(root)
      peakBytes = Math.max(peakBytes, bytes)
      if (bytes > MAX_TEMP_BYTES)
        throw new Error(`Synthetic benchmark exceeded ${MAX_TEMP_BYTES} byte temp-disk limit`)
    }
    await initializeCollection(root, randomUUID())
    await writeSyntheticNotes(root, tier.notes, checkBudget)
    const pdfs = await writeManagedFixtureCopies(root, tier.pdfs, repoRoot)
    await checkBudget()
    const service = await CollectionService.open(root, join(root, "index.sqlite"))
    await service.close()
    await checkBudget()
    const searches = await measureSearch(join(root, "index.sqlite"), tier.searches)
    const cancellation = await measureCancellation()
    const cleanupStarted = performance.now()
    await rm(root, { recursive: true, force: true })
    cleaned = true
    const report = {
      tier: options.tier,
      workload: {
        syntheticNotes: tier.notes,
        managedFixtureCopies: pdfs.copies,
      },
      searches: {
        cold: searches.cold,
        warm: searches.warm,
        definitions: "unit=ms; cold=new handle+search+close; warm=search-only on warmed handle",
      },
      cancellation: {
        ...cancellation,
        searchCancellation:
          "driver-controlled checkpoint only; CollectionIndex.searchIds is synchronous and has no AbortSignal",
      },
      disk: {
        tempLimitBytes: MAX_TEMP_BYTES,
        peakObservedBytes: peakBytes,
        cleanupMs: Number((performance.now() - cleanupStarted).toFixed(3)),
      },
      benchmarkRuntimeIdentity: {
        os: `${os.type()} ${os.release()}`,
        cpu: os.cpus()[0]?.model ?? "unknown",
        ramBytes: os.totalmem(),
        gitHead: git.head,
        sourceDigest,
        diffDigest,
        buildDigest: digest(`${git.head}:${sourceDigest}:${diffDigest}`),
      },
      limitations: [
        "No UI 50ms claim; PDF parsing not measured; synthetic-only with no original files, network, AI, or automatic 100k workload.",
      ],
    }
    const json = `${JSON.stringify(report, null, 2)}\n`
    if (options.output) {
      const destination = resolve(repoRoot, options.output)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, json, { encoding: "utf8", flag: "wx" })
    }
    process.stdout.write(json)
  } finally {
    if (!cleaned) await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Benchmark failed"}\n`)
  process.exitCode = 1
})
