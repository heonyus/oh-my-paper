import { z } from "zod"
import { type AgentThread, agentThreadSchema } from "./agentChat"
import {
  applyFields,
  applyKeyed,
  diffFields,
  diffKeyed,
  fieldGuard,
  type KeyedCollection,
} from "./keyedPatch"
import { READER_NOTES_MAX, type ReaderNote, readerNoteSchema } from "./readerNote"
import {
  type BoardCard,
  boardCardSchema,
  cardIdSchema,
  type DocumentInsight,
  type DocumentRecord,
  documentIdSchema,
  documentInsightSchema,
  documentRecordSchema,
  sha256Schema,
  type Workspace,
  workspaceSchema,
} from "./schemas"

const insightKeySchema = z.string().regex(/^[a-f0-9]{16}:(keywords|threeLines|summary)$/)
const threadIdSchema = agentThreadSchema.unwrap().shape.id
const settingsSchema = workspaceSchema.pick({
  sidebarOpen: true,
  outlineWidth: true,
  researchSidebarWidth: true,
  uiFontFamily: true,
  uiFontScale: true,
  theme: true,
  minimapVisible: true,
  viewport: true,
  activeDocumentId: true,
})
type WorkspaceSettings = z.infer<typeof settingsSchema>

function fieldChangesSchema<F extends z.ZodEnum>(fields: F) {
  return z.object({
    set: z.partialRecord(fields, z.unknown()).optional(),
    unset: z.array(fields).max(fields.options.length).readonly().optional(),
  })
}

function keyedPatchSchema<R extends z.ZodType, K extends z.ZodType<string>, F extends z.ZodEnum>(
  record: R,
  key: K,
  fields: F,
  max?: number,
) {
  const list = <T extends z.ZodType>(item: T) => {
    const array = z.array(item)
    return (max === undefined ? array : array.max(max)).readonly().optional()
  }
  return z.object({
    replace: list(record),
    added: list(record),
    changed: list(fieldChangesSchema(fields).extend({ key })),
    removed: list(key),
    moves: list(z.object({ key, after: key.nullable() })),
  })
}

const documentFields = documentRecordSchema.keyof()
const cardFields = boardCardSchema.keyof()
const threadFields = agentThreadSchema.unwrap().keyof()
const insightFields = documentInsightSchema.keyof()
const noteFields = readerNoteSchema.keyof()
const settingFields = settingsSchema.keyof()

/** What changed between two workspaces: keyed record edits plus changed settings fields. */
export const workspacePatchSchema = z.object({
  documents: keyedPatchSchema(documentRecordSchema, documentIdSchema, documentFields).optional(),
  cards: keyedPatchSchema(boardCardSchema, cardIdSchema, cardFields).optional(),
  agentThreads: keyedPatchSchema(agentThreadSchema, threadIdSchema, threadFields).optional(),
  insights: keyedPatchSchema(documentInsightSchema, insightKeySchema, insightFields).optional(),
  readerNotes: keyedPatchSchema(
    readerNoteSchema,
    documentIdSchema,
    noteFields,
    READER_NOTES_MAX,
  ).optional(),
  settings: fieldChangesSchema(settingFields).optional(),
})

/** A renderer's edits since the acknowledged snapshot named by `baseSnapshotToken`. */
export const workspacePatchRequestSchema = z.object({
  baseSnapshotToken: sha256Schema,
  patch: workspacePatchSchema,
})

/** A committed patch save: the new snapshot and how it differs from the renderer's edits. */
export const workspacePatchSavedSchema = z.object({
  status: z.literal("saved"),
  snapshotToken: sha256Schema,
  revision: z.number().int().nonnegative().optional(),
  patch: workspacePatchSchema,
})

/** `conflict`: the base is unknown or edits collide; `unsupported`: the server predates patches. */
export const workspacePatchResultSchema = z.discriminatedUnion("status", [
  workspacePatchSavedSchema,
  z.object({ status: z.literal("conflict") }),
  z.object({ status: z.literal("unsupported") }),
])

export type WorkspacePatch = z.infer<typeof workspacePatchSchema>
export type WorkspacePatchRequest = z.infer<typeof workspacePatchRequestSchema>
export type WorkspacePatchSaved = z.infer<typeof workspacePatchSavedSchema>
export type WorkspacePatchResult = z.infer<typeof workspacePatchResultSchema>

function collection<R extends object, K extends string, F extends string>(
  name: string,
  keyOf: (record: R) => K,
  fields: readonly F[],
  parse: (value: unknown) => R,
): KeyedCollection<R, K, F> {
  return { name, keyOf, isField: fieldGuard(fields), parse }
}

const documents = collection(
  "documents",
  (record: DocumentRecord) => record.id,
  documentFields.options,
  (value) => documentRecordSchema.parse(value),
)
const cards = collection(
  "cards",
  (record: BoardCard) => record.id,
  cardFields.options,
  (value) => boardCardSchema.parse(value),
)
const agentThreads = collection(
  "agentThreads",
  (record: AgentThread) => record.id,
  threadFields.options,
  (value) => agentThreadSchema.parse(value),
)
const insights = collection(
  "insights",
  (record: DocumentInsight) => `${record.documentId}:${record.kind}`,
  insightFields.options,
  (value) => documentInsightSchema.parse(value),
)
const readerNotes = collection(
  "readerNotes",
  (record: ReaderNote) => record.documentId,
  noteFields.options,
  (value) => readerNoteSchema.parse(value),
)
const isSettingField = fieldGuard(settingFields.options)

function settingsOf(workspace: Workspace): WorkspaceSettings {
  return {
    sidebarOpen: workspace.sidebarOpen,
    outlineWidth: workspace.outlineWidth,
    researchSidebarWidth: workspace.researchSidebarWidth,
    uiFontFamily: workspace.uiFontFamily,
    uiFontScale: workspace.uiFontScale,
    theme: workspace.theme,
    minimapVisible: workspace.minimapVisible,
    viewport: workspace.viewport,
    activeDocumentId: workspace.activeDocumentId,
  }
}

/** The patch that turns `from` into `to`; revision and snapshot tokens are not part of it. */
export function diffWorkspace(from: Workspace, to: Workspace): WorkspacePatch {
  const changes = {
    documents: diffKeyed(documents, from.documents, to.documents),
    cards: diffKeyed(cards, from.cards, to.cards),
    agentThreads: diffKeyed(agentThreads, from.agentThreads, to.agentThreads),
    insights: diffKeyed(insights, from.insights, to.insights),
    readerNotes: diffKeyed(readerNotes, from.readerNotes, to.readerNotes),
    settings: diffFields(settingsOf(from), settingsOf(to), isSettingField),
  }
  return {
    ...(changes.documents ? { documents: changes.documents } : {}),
    ...(changes.cards ? { cards: changes.cards } : {}),
    ...(changes.agentThreads ? { agentThreads: changes.agentThreads } : {}),
    ...(changes.insights ? { insights: changes.insights } : {}),
    ...(changes.readerNotes ? { readerNotes: changes.readerNotes } : {}),
    ...(changes.settings ? { settings: changes.settings } : {}),
  }
}

/** Applies a patch to the workspace it was computed from, validating every rebuilt record. */
export function applyWorkspacePatch(base: Workspace, patch: WorkspacePatch): Workspace {
  return {
    ...base,
    ...(patch.documents
      ? { documents: [...applyKeyed(documents, base.documents, patch.documents)] }
      : {}),
    ...(patch.cards ? { cards: [...applyKeyed(cards, base.cards, patch.cards)] } : {}),
    ...(patch.agentThreads
      ? { agentThreads: [...applyKeyed(agentThreads, base.agentThreads, patch.agentThreads)] }
      : {}),
    ...(patch.insights
      ? { insights: [...applyKeyed(insights, base.insights, patch.insights)] }
      : {}),
    ...(patch.readerNotes
      ? { readerNotes: [...applyKeyed(readerNotes, base.readerNotes, patch.readerNotes)] }
      : {}),
    ...(patch.settings
      ? applyFields(settingsOf(base), patch.settings, (value) => settingsSchema.parse(value))
      : {}),
  }
}

/** The acknowledged workspace a renderer rebuilds from the workspace it sent and the answer. */
export function acknowledgedFromPatch(sent: Workspace, saved: WorkspacePatchSaved): Workspace {
  const {
    baseRevision: _baseRevision,
    baseSnapshotToken: _baseSnapshotToken,
    ...committed
  } = applyWorkspacePatch(sent, saved.patch)
  return { ...committed, revision: saved.revision, snapshotToken: saved.snapshotToken }
}
