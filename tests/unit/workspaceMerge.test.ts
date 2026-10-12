import { describe, expect, it } from "vitest"
import { documentRecordSchema, workspaceSchema } from "../../src/shared/schemas"
import {
  isWorkspaceConflictError,
  mergeWorkspaceForSave,
  resolveWorkspaceConflicts,
  WorkspaceConflictError,
} from "../../src/shared/workspaceMerge"

const paper = documentRecordSchema.parse({
  id: "1111111111111111",
  name: "paper.pdf",
  hash: "1".repeat(64),
  bytes: 100,
  importedAt: "2026-09-05T00:00:00.000Z",
  pageCount: 30,
  title: "Paper",
  authors: [],
  year: null,
  doi: null,
  overview: "",
  quality: { textCharacters: 10, needsOcr: false, warnings: [] },
  lastReadPage: 1,
})
const base = workspaceSchema.parse({
  documents: [paper],
  cards: [],
  sidebarOpen: true,
  viewport: { x: 0, y: 0, zoom: 1 },
  activeDocumentId: paper.id,
})
const turned = (page: number) => ({
  ...base,
  documents: [{ ...paper, lastReadPage: page }],
})

describe("resolveWorkspaceConflicts", () => {
  it("keeps the incoming value for a field both sides changed, where the plain merge refuses", () => {
    const current = turned(5)
    const incoming = { ...turned(9), theme: "dark" as const }
    expect(() => mergeWorkspaceForSave(base, current, incoming)).toThrow(WorkspaceConflictError)
    const resolved = resolveWorkspaceConflicts(base, current, incoming)
    expect(resolved.documents[0]?.lastReadPage).toBe(9)
    expect(resolved.theme).toBe("dark")
  })

  it("still keeps what only the current side changed", () => {
    const current = { ...turned(5), sidebarOpen: false }
    const resolved = resolveWorkspaceConflicts(base, current, turned(9))
    expect(resolved.sidebarOpen).toBe(false)
    expect(resolved.documents[0]?.lastReadPage).toBe(9)
  })
})

describe("isWorkspaceConflictError", () => {
  it("recognises the error itself and a backend's report of one", () => {
    expect(isWorkspaceConflictError(new WorkspaceConflictError("card.x"))).toBe(true)
    expect(isWorkspaceConflictError(new Error("Workspace conflict at baseSnapshotToken:abc"))).toBe(
      true,
    )
    expect(isWorkspaceConflictError(new Error("network down"))).toBe(false)
    expect(isWorkspaceConflictError("Workspace conflict at x")).toBe(false)
  })
})
