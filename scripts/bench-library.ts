import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { z } from "zod"
import { WorkspaceStore } from "../src/electron/workspaceStore"
import {
  type BoardCard,
  boardCardSchema,
  type DocumentRecord,
  documentRecordSchema,
  type Workspace,
} from "../src/shared/schemas"

const HELP =
  "Usage: npx tsx scripts/bench-library.ts [--papers <n>] [--cards <n>] [--notes <n>]\n\n" +
  "Times WorkspaceStore on a synthetic library in a temporary data directory (server mode).\n" +
  "Defaults: 500 papers with ~8 KB overviews, 2,000 cards, 100 reader notes.\n"

type Options = { readonly papers: number; readonly cards: number; readonly notes: number }

function numberOption(argv: readonly string[], name: string, fallback: number): number {
  const index = argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(argv[index + 1])
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} needs a positive integer`)
  return value
}

function parseOptions(argv: readonly string[]): Options | null {
  if (argv.includes("--help")) return null
  return {
    papers: numberOption(argv, "papers", 500),
    cards: numberOption(argv, "cards", 2_000),
    notes: numberOption(argv, "notes", 100),
  }
}

function paper(index: number): DocumentRecord {
  const sentence = `Paper ${index} studies retrieval, memory and evaluation in long documents. `
  return documentRecordSchema.parse({
    id: (index + 1).toString(16).padStart(16, "0"),
    name: `paper-${index}.pdf`,
    hash: (index + 1).toString(16).padStart(64, "0"),
    bytes: 1_048_576 + index,
    importedAt: "2026-09-01T00:00:00.000Z",
    pageCount: 12 + (index % 20),
    title: `Synthetic paper ${index}`,
    authors: ["Alice Kim", "Bob Lee"],
    year: 2020 + (index % 6),
    doi: `10.1234/synthetic.${index}`,
    kind: "research_paper",
    overview: sentence.repeat(Math.floor(7_900 / sentence.length)),
    quality: { textCharacters: 40_000, needsOcr: false, warnings: [] },
  })
}

function card(index: number, document: DocumentRecord): BoardCard {
  return boardCardSchema.parse({
    id: randomUUID(),
    documentId: document.id,
    kind: index % 5 === 0 ? "translation" : "note",
    title: `Card ${index}`,
    body: `A reader note about passage ${index}. `.repeat(6),
    x: (index % 40) * 320,
    y: Math.floor(index / 40) * 240,
    minimized: false,
    anchor: {
      page: 1 + (index % 10),
      quote: `Quoted passage ${index} from the paper.`,
      x: 72,
      y: 120 + (index % 30) * 10,
      fragments: [{ x: 72, y: 120, width: 300, height: 14 }],
    },
  })
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

async function timed<T>(operation: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const started = performance.now()
  const result = await operation()
  return { result, ms: performance.now() - started }
}

function requireItem<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`Missing benchmark item ${index}`)
  return item
}

const paperUpdateRowSchema = z.object({ id: z.string(), updated_at: z.string() })

/** Each paper node's last update time, to count the papers a save rewrote. */
function paperUpdates(store: WorkspaceStore): ReadonlyMap<string, string> {
  const rows = store.db.prepare("SELECT id, updated_at FROM knowledge_nodes WHERE kind = 'paper'")
  return new Map(
    rows.all().map((raw) => {
      const row = paperUpdateRowSchema.parse(raw)
      return [row.id, row.updated_at]
    }),
  )
}

/** Times a save and counts the paper nodes it rewrote. */
async function timedSave(
  store: WorkspaceStore,
  workspace: Workspace,
): Promise<{ result: Workspace; ms: number; rewrittenPapers: number }> {
  const before = paperUpdates(store)
  const saved = await timed(() => store.save(workspace))
  const after = paperUpdates(store)
  const rewrittenPapers = [...after].filter(([id, at]) => before.get(id) !== at).length
  return { ...saved, rewrittenPapers }
}

const ms = (value: number): string => `${value.toFixed(1)} ms`

async function run(options: Options): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ohmypaper-bench-library-"))
  const rows: [string, string][] = []
  try {
    const papers = Array.from({ length: options.papers }, (_, index) => paper(index))
    let store = new WorkspaceStore(root)
    await store.read()

    const addTimes: number[] = []
    for (const document of papers)
      addTimes.push((await timed(() => store.addDocument(document))).ms)
    const tail = addTimes.slice(-50)
    rows.push([`addDocument x${options.papers} (total)`, ms(addTimes.reduce((a, b) => a + b, 0))])
    rows.push(["addDocument, last 50 (median each)", ms(median(tail))])
    const duplicate = await timed(() => store.addDocument(requireItem(papers, 0)))
    if (!duplicate.result.duplicate) throw new Error("Duplicate import was not detected")
    rows.push(["addDocument duplicate", ms(duplicate.ms)])

    const initial = await store.read()
    const cards = Array.from({ length: options.cards }, (_, index) =>
      card(index, requireItem(papers, index % papers.length)),
    )
    const readerNotes = papers.slice(0, options.notes).map((document) => ({
      documentId: document.id,
      markdown: `# ${document.title}\n\n${"My own words about this paper. ".repeat(60)}`,
      updatedAt: "2026-09-01T00:00:00.000Z",
    }))
    const seeded = await timed(() =>
      store.save({ ...initial, baseSnapshotToken: initial.snapshotToken, cards, readerNotes }),
    )
    rows.push([`save adding ${options.cards} cards + ${options.notes} notes`, ms(seeded.ms)])
    await store.close()

    store = new WorkspaceStore(root)
    const cold = await timed(() => store.read())
    rows.push(["read() cold (new store)", ms(cold.ms)])
    const warm: number[] = []
    for (let index = 0; index < 7; index += 1) warm.push((await timed(() => store.read())).ms)
    rows.push(["read() warm (median of 7)", ms(median(warm))])

    let latest: Workspace = await store.read()
    const cardSaves: number[] = []
    const cardRewrites: number[] = []
    for (let index = 0; index < 7; index += 1) {
      const moved = latest.cards.map((item, position) =>
        position === index ? { ...item, x: item.x + 10 } : item,
      )
      const saved = await timedSave(store, {
        ...latest,
        baseSnapshotToken: latest.snapshotToken,
        cards: moved,
      })
      cardSaves.push(saved.ms)
      cardRewrites.push(saved.rewrittenPapers)
      latest = saved.result
    }
    rows.push(["save() one card moved (median of 7)", ms(median(cardSaves))])
    rows.push([
      "save() one card moved: papers rewritten (max of 7)",
      String(Math.max(...cardRewrites)),
    ])

    const pageSaves: number[] = []
    const pageRewrites: number[] = []
    for (let index = 0; index < 7; index += 1) {
      const target = requireItem(latest.documents, index)
      const documents = latest.documents.map((item) =>
        item.id === target.id ? { ...item, lastReadPage: 2 + index } : item,
      )
      const saved = await timedSave(store, {
        ...latest,
        baseSnapshotToken: latest.snapshotToken,
        documents,
      })
      pageSaves.push(saved.ms)
      pageRewrites.push(saved.rewrittenPapers)
      latest = saved.result
    }
    rows.push(["save() one lastReadPage (median of 7)", ms(median(pageSaves))])
    rows.push([
      "save() one lastReadPage: papers rewritten (max of 7)",
      String(Math.max(...pageRewrites)),
    ])
    rows.push(["read() after save", ms((await timed(() => store.read())).ms)])

    const lookups: number[] = []
    for (let index = 0; index < 101; index += 1) {
      const target = requireItem(papers, (index * 37) % papers.length)
      lookups.push((await timed(() => store.findDocument(target.id))).ms)
    }
    rows.push(["findDocument (median of 101)", ms(median(lookups))])
    const lists: number[] = []
    for (let index = 0; index < 7; index += 1)
      lists.push((await timed(() => store.listDocuments())).ms)
    rows.push(["listDocuments (median of 7)", ms(median(lists))])
    await store.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
  console.log(
    `\n${options.papers} papers, ${options.cards} cards, ${options.notes} reader notes (Node ${process.version})\n`,
  )
  console.log("| operation | result |\n| --- | ---: |")
  for (const [label, value] of rows) console.log(`| ${label} | ${value} |`)
}

const options = parseOptions(process.argv.slice(2))
if (options) {
  void run(options).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`)
    process.exitCode = 1
  })
} else process.stdout.write(HELP)
