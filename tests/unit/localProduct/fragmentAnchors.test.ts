import { describe, expect, it } from "vitest"
import { locateNoteFragment, noteFragmentSchema } from "../../../src/shared/fragmentAnchors"

const revision = "a".repeat(64)
const changedRevision = "b".repeat(64)
const quote = "확인한 원문"
const anchor = noteFragmentSchema.parse({
  id: "11aeef2b-b7fd-4a23-9a3e-7c34e13b416b",
  nodeId: "21aeef2b-b7fd-4a23-9a3e-7c34e13b416b",
  blockId: null,
  revision,
  quote,
  prefix: "",
  suffix: "",
  from: 0,
  to: quote.length,
})

describe("note fragment relocation", () => {
  it("resolves an unchanged revision at its exact source range", () => {
    const document = { text: quote, revision }
    const result = locateNoteFragment(anchor, document)
    expect(result).toEqual({ status: "resolved", from: 0, to: quote.length })
  })
  it("relocates a unique quotation after an external insertion", () => {
    const document = { text: `새 문장\n${quote}`, revision: changedRevision }
    const result = locateNoteFragment(anchor, document)
    expect(result).toEqual({ status: "resolved", from: 5, to: 5 + quote.length })
  })
  it("requires repair instead of choosing the first of repeated quotations", () => {
    const document = { text: `${quote}\n${quote}`, revision: changedRevision }
    const result = locateNoteFragment(anchor, document)
    expect(result).toEqual({ status: "needs_repair", reason: "ambiguous" })
  })
  it("uses context to disambiguate without changing the stored quotation", () => {
    const contextual = { ...anchor, prefix: "근거: " }
    const document = { text: `${quote}\n근거: ${quote}`, revision: changedRevision }
    const result = locateNoteFragment(contextual, document)
    expect(result).toEqual({ status: "resolved", from: quote.length + 5, to: quote.length * 2 + 5 })
  })
  it("preserves a deleted quotation as missing evidence", () => {
    const result = locateNoteFragment(anchor, { text: "다른 내용", revision: changedRevision })
    expect(result).toEqual({ status: "needs_repair", reason: "missing" })
  })
  it("requires repair when an explicitly anchored block marker disappears", () => {
    const marked = { ...anchor, blockId: "31aeef2b-b7fd-4a23-9a3e-7c34e13b416b" }
    const result = locateNoteFragment(marked, { text: quote, revision: changedRevision })
    expect(result).toEqual({ status: "needs_repair", reason: "block_missing" })
  })
})
