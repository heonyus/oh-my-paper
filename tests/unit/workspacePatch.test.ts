import { describe, expect, it } from "vitest"
import { WorkspaceConflictError } from "../../src/shared/workspaceMerge"
import {
  applyWorkspacePatch,
  diffWorkspace,
  workspacePatchSchema,
} from "../../src/shared/workspacePatch"
import {
  type Random,
  randomCard,
  randomDocument,
  randomEdits,
  randomWorkspace,
  seededRandom,
} from "../support/workspacePatchFixtures"

function overTheWire(patch: ReturnType<typeof diffWorkspace>) {
  return workspacePatchSchema.parse(JSON.parse(JSON.stringify(patch)))
}

describe("workspace patch", () => {
  it("rebuilds the edited workspace from the patch for many generated edits", () => {
    const random: Random = seededRandom(20260929)
    const seen = new Set<string>()
    for (let round = 0; round < 400; round += 1) {
      const before = randomWorkspace(random)
      const after = randomEdits(random, before)
      const patch = diffWorkspace(before, after)
      for (const [name, change] of Object.entries(patch)) {
        for (const [part, value] of Object.entries(change ?? {})) {
          seen.add(`${name}.${part}`)
          if (part === "changed" && JSON.stringify(value).includes('"unset"')) seen.add("unset")
        }
      }

      expect(applyWorkspacePatch(before, patch)).toEqual(after)
      expect(applyWorkspacePatch(before, overTheWire(patch))).toEqual(after)
    }
    for (const name of ["documents", "cards", "agentThreads", "insights", "readerNotes"]) {
      expect(seen).toContain(`${name}.added`)
      expect(seen).toContain(`${name}.changed`)
      expect(seen).toContain(`${name}.removed`)
    }
    for (const part of ["documents.moves", "cards.moves", "cards.replace", "settings.set", "unset"])
      expect(seen).toContain(part)
  })

  it("is empty for identical workspaces, including deep copies", () => {
    const workspace = randomWorkspace(seededRandom(7))

    expect(diffWorkspace(workspace, workspace)).toEqual({})
    expect(diffWorkspace(workspace, structuredClone(workspace))).toEqual({})
    expect(diffWorkspace(workspace, JSON.parse(JSON.stringify(workspace)))).toEqual({})
  })

  it("sends only the changed field of a page turn", () => {
    const workspace = randomWorkspace(seededRandom(11))
    const target = workspace.documents[0]
    if (!target) throw new Error("Expected a document")
    const turned = {
      ...workspace,
      documents: workspace.documents.map((document) =>
        document.id === target.id ? { ...document, lastReadPage: 3 } : document,
      ),
    }

    expect(diffWorkspace(workspace, turned)).toEqual({
      documents: { changed: [{ key: target.id, set: { lastReadPage: 3 } }] },
    })
  })

  it("moves only the records whose relative order changed", () => {
    const random = seededRandom(13)
    const generated = randomWorkspace(random)
    const workspace = {
      ...generated,
      cards: [randomCard(random, generated), randomCard(random, generated)],
    }
    const appended = { ...workspace, cards: [...workspace.cards, randomCard(random, workspace)] }
    const prepended = { ...workspace, cards: [randomCard(random, workspace), ...workspace.cards] }

    const front = prepended.cards[0]
    if (!front) throw new Error("Expected a prepended card")

    expect(diffWorkspace(workspace, appended).cards?.moves).toBeUndefined()
    expect(diffWorkspace(workspace, prepended).cards).toMatchObject({
      added: [front],
      moves: [{ key: front.id, after: null }],
    })
  })

  it("replaces a collection whose keys repeat", () => {
    const random = seededRandom(17)
    const workspace = randomWorkspace(random)
    const document = randomDocument(random)
    const repeated = { ...workspace, documents: [document, document] }
    const patch = diffWorkspace(workspace, repeated)

    expect(patch.documents?.replace).toHaveLength(2)
    expect(applyWorkspacePatch(workspace, overTheWire(patch))).toEqual(repeated)
  })

  it("treats a change to a record the base lacks as a conflict", () => {
    const random = seededRandom(19)
    const workspace = randomWorkspace(random)
    const missing = randomDocument(random)

    expect(() =>
      applyWorkspacePatch(workspace, {
        documents: { changed: [{ key: missing.id, set: { lastReadPage: 2 } }] },
      }),
    ).toThrow(WorkspaceConflictError)
  })

  it("rejects invalid field values and unknown fields at the boundary", () => {
    const workspace = randomWorkspace(seededRandom(23))
    const target = workspace.documents[0]
    if (!target) throw new Error("Expected a document")

    expect(() =>
      applyWorkspacePatch(workspace, {
        documents: { changed: [{ key: target.id, set: { lastReadPage: -4 } }] },
      }),
    ).toThrow()
    expect(
      workspacePatchSchema.safeParse({
        documents: { changed: [{ key: target.id, set: { __proto__: 1, secret: true } }] },
      }).success,
    ).toBe(false)
    expect(
      workspacePatchSchema.safeParse({ settings: { set: { outlineWidth: 9_000 } } }).success,
    ).toBe(true)
    expect(() =>
      applyWorkspacePatch(workspace, { settings: { set: { outlineWidth: 9_000 } } }),
    ).toThrow()
  })
})
