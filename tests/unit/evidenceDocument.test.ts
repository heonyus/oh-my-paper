import { describe, expect, it } from "vitest"
import { evidenceDocument } from "../../src/renderer/lib/evidenceDocument"
import { evidenceNavigationTargetSchema } from "../../src/shared/knowledgeIpc"
import { documentRecordSchema } from "../../src/shared/schemas"

const document = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "synthetic.pdf",
  title: "Same title",
  hash: "a".repeat(64),
  bytes: 100,
  importedAt: "2026-09-05T00:00:00.000Z",
  pageCount: 3,
  authors: [],
  year: null,
  doi: null,
  overview: "",
  quality: { textCharacters: 100, needsOcr: false, warnings: [] },
})
const target = evidenceNavigationTargetSchema.parse({
  anchorId: "00000000-0000-4000-8000-000000000001",
  documentVersionId: "00000000-0000-4000-8000-000000000002",
  originalDocumentId: document.id,
  hash: document.hash,
  page: 2,
  quote: "Synthetic source",
  x: 0,
  y: 0,
  fragments: [],
})

describe("evidence source resolution", () => {
  it("opens the exact content hash, never a similar title or replaced document", () => {
    expect(evidenceDocument(target, [document]).id).toBe(document.id)
    expect(() =>
      evidenceDocument(target, [
        { ...document, hash: documentRecordSchema.shape.hash.parse("b".repeat(64)) },
      ]),
    ).toThrow()
    expect(() => evidenceDocument({ ...target, page: 4 }, [document])).toThrow()
  })
})
