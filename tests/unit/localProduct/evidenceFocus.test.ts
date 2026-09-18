import { expect, test } from "vitest"
import { evidenceFocusViewport } from "../../../src/renderer/lib/evidenceFocus"
import {
  documentVersionIdSchema,
  evidenceAnchorIdSchema,
} from "../../../src/shared/knowledgeSchemas"

test("evidence navigation focuses stored source geometry without inventing missing geometry", () => {
  const target = {
    anchorId: evidenceAnchorIdSchema.parse("00000000-0000-4000-8000-000000000001"),
    documentVersionId: documentVersionIdSchema.parse("00000000-0000-4000-8000-000000000002"),
    originalDocumentId: "source",
    hash: "a".repeat(64),
    page: 2,
    quote: "A source passage",
    x: 0,
    y: 0,
    fragments: [{ x: 100, y: 900, width: 300, height: 40 }],
  }
  expect(
    evidenceFocusViewport({ x: 0, y: 0, zoom: 2 }, { width: 1000, height: 800 }, target),
  ).toEqual({ x: 0, y: -1704, zoom: 2 })
  expect(
    evidenceFocusViewport(
      { x: 0, y: 0, zoom: 2 },
      { width: 1000, height: 800 },
      { ...target, fragments: [] },
    ),
  ).toBeNull()
})
