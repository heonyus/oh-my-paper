// @vitest-environment node
import { describe, expect, it } from "vitest"
import { exportHtml } from "../../../src/electron/exportHtml"
import { exportMarkdown } from "../../../src/electron/exportMarkdown"
import { createExportSnapshot } from "../../../src/electron/exportSnapshot"

const REVISION = "b".repeat(64)

function snapshot() {
  return createExportSnapshot({
    format: "scourgify-export-snapshot-v1",
    title: "다국어 report",
    revision: REVISION,
    markdown: [
      "# 결과 Results",
      "한국어와 English prose with [source](https://example.org/paper).",
      "",
      "| 조건 | 값 |",
      "| --- | ---: |",
      "| split | test |",
      "",
      "$$E = mc^2$$",
      "Inline $x + y$ stays inline.",
      "",
      "![plot](scourgify-asset:plot)",
    ].join("\n"),
    records: [],
    assets: [
      {
        id: "plot",
        source: "scourgify-asset:plot",
        filename: "plot.png",
        mediaType: "image/png",
        bytes: Uint8Array.from([137, 80, 78, 71]),
        width: 320,
        height: 200,
        altText: "Result plot",
      },
    ],
    bibliography: [{ key: "paper", text: "Author. Paper.", url: "https://example.org/paper" }],
    sources: [
      {
        id: "source-1",
        label: "Paper page 3",
        locator: "oh-my-paper source source-1, page 3",
        url: null,
        availability: "scourgify_only",
      },
    ],
  })
}

describe("Markdown and HTML export", () => {
  it("writes portable Markdown plus relative local assets", () => {
    // Given
    const selected = snapshot()

    // When
    const bundle = exportMarkdown(selected)
    const markdownFile = bundle.files.find((file) => file.mediaType === "text/markdown")
    const markdown = markdownFile ? new TextDecoder().decode(markdownFile.bytes) : ""

    // Then
    expect(bundle.files.map((file) => file.relativePath)).toEqual([
      "다국어-report.md",
      "assets/plot.png",
    ])
    expect(markdown).toContain("format: ohmypaper-selected-export")
    expect(markdown).toContain("![Result plot](assets/plot.png)")
    expect(markdown).toContain("| 조건")
    expect(markdown).toContain("| split | test |")
    expect(markdown).toContain("$$\nE = mc^2\n$$")
    expect(markdown).toContain("Inline $x + y$ stays inline.")
    expect(markdown).toContain("Source links marked scourgify_only require oh-my-paper")
  })

  it("builds inert offline HTML with tables, MathML, safe links, and embedded images", () => {
    // Given
    const selected = snapshot()

    // When
    const file = exportHtml(selected)
    const html = new TextDecoder().decode(file.bytes)

    // Then
    expect(html).toContain("Content-Security-Policy")
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("<table>")
    expect(html).toContain("<math")
    expect(html).toContain('href="https://example.org/paper"')
    expect(html).toContain('rel="noreferrer noopener"')
    expect(html).toContain("data:image/png;base64,")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("javascript:")
  })
})
