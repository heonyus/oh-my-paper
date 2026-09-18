// @vitest-environment node
import { describe, expect, it } from "vitest"
import { createExportSnapshot } from "../../../src/electron/exportSnapshot"
import { exportSnapshotInputSchema } from "../../../src/shared/exportSchemas"

const REVISION = "a".repeat(64)

describe("export snapshot", () => {
  it("rejects hidden state at the selected-content boundary", () => {
    // Given
    const input = {
      format: "scourgify-export-snapshot-v1",
      title: "Selected report",
      revision: REVISION,
      markdown: "Visible",
      records: [],
      assets: [],
      bibliography: [],
      sources: [],
      hiddenState: { accessToken: "must-not-cross" },
    }

    // When
    const result = exportSnapshotInputSchema.safeParse(input)

    // Then
    expect(result.success).toBe(false)
  })

  it("redacts destination-bound secrets and private paths without changing source Markdown", () => {
    // Given
    const markdown = [
      "# 결과",
      "password: super-secret",
      "로컬 파일 /Users/researcher/private/note.md",
      "[unsafe](javascript:alert(1))",
    ].join("\n\n")

    // When
    const snapshot = createExportSnapshot({
      format: "scourgify-export-snapshot-v1",
      title: "Selected report",
      revision: REVISION,
      markdown,
      records: [],
      assets: [],
      bibliography: [],
      sources: [],
    })

    // Then
    expect(markdown).toContain("super-secret")
    expect(JSON.stringify(snapshot.root)).not.toContain("super-secret")
    expect(JSON.stringify(snapshot.root)).not.toContain("/Users/researcher")
    expect(snapshot.limitations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "suspected_secret_redacted",
        "private_path_redacted",
        "unsafe_link_removed",
      ]),
    )
  })

  it("keeps only explicitly supplied in-memory local images", () => {
    // Given
    const bytes = Uint8Array.from([137, 80, 78, 71])

    // When
    const snapshot = createExportSnapshot({
      format: "scourgify-export-snapshot-v1",
      title: "Images",
      revision: REVISION,
      markdown: "![plot](scourgify-asset:plot)\n\n![missing](file:///tmp/missing.png)",
      records: [],
      assets: [
        {
          id: "plot",
          source: "scourgify-asset:plot",
          filename: "plot.png",
          mediaType: "image/png",
          bytes,
          width: 640,
          height: 480,
          altText: "Aggregate result plot",
        },
      ],
      bibliography: [],
      sources: [],
    })

    // Then
    expect(snapshot.assets).toHaveLength(1)
    expect(snapshot.assets[0]?.bytes).toBe(bytes)
    expect(snapshot.limitations.map((item) => item.code)).toContain("missing_asset")
  })
})
