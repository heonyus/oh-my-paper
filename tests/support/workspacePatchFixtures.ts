import { type AgentThread, agentThreadSchema } from "../../src/shared/agentChat"
import { type ReaderNote, readerNoteSchema } from "../../src/shared/readerNote"
import {
  type BoardCard,
  boardCardSchema,
  type DocumentInsight,
  type DocumentRecord,
  documentInsightSchema,
  documentRecordSchema,
  type Workspace,
  workspaceSchema,
} from "../../src/shared/schemas"

export type Random = () => number

/** A deterministic mulberry32 generator so failures replay. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const integer = (random: Random, max: number): number => Math.floor(random() * max)
const hex = (random: Random, length: number): string =>
  Array.from({ length }, () => integer(random, 16).toString(16)).join("")
const uuid = (random: Random): string =>
  `${hex(random, 8)}-${hex(random, 4)}-4${hex(random, 3)}-8${hex(random, 3)}-${hex(random, 12)}`
const word = (random: Random): string => `w${hex(random, 6)}`
function pick<T>(random: Random, items: readonly T[]): T | undefined {
  return items[integer(random, items.length)]
}

export function randomDocument(random: Random): DocumentRecord {
  return documentRecordSchema.parse({
    id: hex(random, 16),
    name: `${word(random)}.pdf`,
    hash: hex(random, 64),
    bytes: 1 + integer(random, 9_000_000),
    importedAt: "2026-09-01T00:00:00.000Z",
    pageCount: 1 + integer(random, 40),
    title: word(random),
    authors: [word(random)],
    year: random() < 0.5 ? null : 2000 + integer(random, 26),
    doi: null,
    overview: random() < 0.5 ? "" : word(random).repeat(40),
    ...(random() < 0.5 ? { lastReadPage: 1 } : {}),
    quality: { textCharacters: integer(random, 90_000), needsOcr: false, warnings: [] },
  })
}

export function randomCard(random: Random, workspace: Pick<Workspace, "documents">): BoardCard {
  return boardCardSchema.parse({
    id: uuid(random),
    documentId: pick(random, workspace.documents)?.id ?? hex(random, 16),
    kind: pick(random, ["note", "translation", "highlight"] as const),
    title: word(random),
    body: word(random),
    x: integer(random, 2_000),
    y: integer(random, 2_000),
    minimized: random() < 0.2,
    chat: random() < 0.5 ? [] : [{ role: "user", content: word(random) }],
    ...(random() < 0.5 ? { sourceKey: word(random) } : {}),
    anchor: { page: 1, quote: word(random), x: 1, y: 2, fragments: [] },
  })
}

function randomThread(random: Random): AgentThread {
  return agentThreadSchema.parse({
    id: uuid(random),
    title: word(random),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    messages: [{ role: "user", content: word(random) }],
  })
}

function randomInsight(random: Random, documentId: string): DocumentInsight {
  return documentInsightSchema.parse({
    documentId,
    kind: pick(random, ["keywords", "threeLines", "summary"] as const),
    value: word(random),
    updatedAt: "2026-09-01T00:00:00.000Z",
  })
}

function randomNote(random: Random, documentId: string): ReaderNote {
  return readerNoteSchema.parse({
    documentId,
    markdown: word(random),
    updatedAt: "2026-09-01T00:00:00.000Z",
  })
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item]))
  return [...byKey.values()]
}

export function randomWorkspace(random: Random): Workspace {
  const documents = Array.from({ length: 2 + integer(random, 6) }, () => randomDocument(random))
  const ids = documents.map((document) => document.id)
  return workspaceSchema.parse({
    documents,
    cards: Array.from({ length: integer(random, 6) }, () => randomCard(random, { documents })),
    agentThreads: Array.from({ length: integer(random, 3) }, () => randomThread(random)),
    insights: uniqueBy(
      ids.flatMap((id) => (random() < 0.5 ? [randomInsight(random, id)] : [])),
      (insight) => `${insight.documentId}:${insight.kind}`,
    ),
    readerNotes: ids.flatMap((id) => (random() < 0.4 ? [randomNote(random, id)] : [])),
    sidebarOpen: random() < 0.5,
    viewport: { x: integer(random, 100), y: integer(random, 100), zoom: 1 },
    activeDocumentId: pick(random, ids) ?? null,
  })
}

function without<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, position) => position !== index)
}

function swapped<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items]
  const [first, second, ...rest] = items
  return first === undefined || second === undefined ? [...items] : [second, first, ...rest]
}

function editOnce(random: Random, workspace: Workspace): Workspace {
  const { documents, cards, agentThreads, insights, readerNotes } = workspace
  const document = integer(random, documents.length)
  const card = integer(random, cards.length)
  const edits: readonly (() => Workspace)[] = [
    () => ({ ...workspace, documents: [...documents, randomDocument(random)] }),
    () => ({ ...workspace, documents: without(documents, document) }),
    () => ({ ...workspace, documents: swapped(documents) }),
    () => ({
      ...workspace,
      documents: [...documents.slice(document, document + 1), ...without(documents, document)],
    }),
    () => ({
      ...workspace,
      documents: documents.map((item, index) => {
        if (index !== document) return item
        if (item.lastReadPage === undefined) return { ...item, lastReadPage: item.pageCount }
        const { lastReadPage: _page, ...rest } = item
        return { ...rest, title: word(random), overview: word(random) }
      }),
    }),
    () => ({ ...workspace, cards: [...cards, randomCard(random, workspace)] }),
    () => ({ ...workspace, cards: [randomCard(random, workspace), ...cards] }),
    () => ({ ...workspace, cards: without(cards, card) }),
    () => ({
      ...workspace,
      cards: cards.map((item, index) => {
        if (index !== card) return item
        const { sourceKey: _key, ...rest } = item
        return {
          ...rest,
          x: item.x + 40,
          chat: [...item.chat, { role: "assistant", content: "ok" }],
        }
      }),
    }),
    () => ({ ...workspace, agentThreads: [randomThread(random), ...agentThreads] }),
    () => ({ ...workspace, agentThreads: agentThreads.slice(1) }),
    () => ({
      ...workspace,
      agentThreads: agentThreads.map((thread, index) =>
        index === 0
          ? { ...thread, title: word(random), updatedAt: "2026-09-02T00:00:00.000Z" }
          : thread,
      ),
    }),
    () => ({ ...workspace, insights: insights.slice(1) }),
    () => ({
      ...workspace,
      insights: uniqueBy(
        [
          ...insights.map((item) => ({ ...item, value: word(random) })),
          randomInsight(random, pick(random, documents)?.id ?? hex(random, 16)),
        ],
        (insight) => `${insight.documentId}:${insight.kind}`,
      ),
    }),
    () => ({ ...workspace, readerNotes: readerNotes.slice(1) }),
    () => ({
      ...workspace,
      readerNotes: uniqueBy(
        [
          ...readerNotes.map((note) => ({ ...note, markdown: `${note.markdown}!` })),
          randomNote(random, hex(random, 16)),
        ],
        (note) => note.documentId,
      ),
    }),
    () => ({ ...workspace, sidebarOpen: !workspace.sidebarOpen, theme: "dark" }),
    () => ({ ...workspace, viewport: { ...workspace.viewport, x: workspace.viewport.x + 1 } }),
    () => ({ ...workspace, activeDocumentId: null, outlineWidth: 300 }),
    () => ({ ...workspace, cards: [...cards, ...cards.slice(0, 1)] }),
  ]
  return pick(random, edits)?.() ?? workspace
}

/** One to five random edits of documents, cards, threads, insights, notes and settings. */
export function randomEdits(random: Random, workspace: Workspace): Workspace {
  let edited = workspace
  for (let count = 1 + integer(random, 5); count > 0; count -= 1) edited = editOnce(random, edited)
  return edited
}
