// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createExportSnapshotRevision } from "../../../src/electron/applicationExport"

const assets = [
  {
    source: "assets/a.png",
    bytes: new Uint8Array([1, 2, 3]),
  },
]

describe("export consent revision", () => {
  it("changes when linked bibliography changes even if the note file does not", () => {
    const first = createExportSnapshotRevision(
      "a".repeat(64),
      [],
      [{ key: "paper", text: "A", url: null }],
      [],
      assets,
    )
    const second = createExportSnapshotRevision(
      "a".repeat(64),
      [],
      [{ key: "paper", text: "B", url: null }],
      [],
      assets,
    )

    expect(second).not.toBe(first)
  })
})
