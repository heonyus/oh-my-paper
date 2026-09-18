// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  buildResearchReport,
  reportNoteInput,
  researchDraftNotice,
} from "../../../src/electron/researchReport"
import {
  researchJobIdSchema,
  researchModelDecisionSchema,
} from "../../../src/shared/researchJobSchemas"
import { researchSourceSchema } from "../../../src/shared/researchSourceSchemas"

const htmlSource = researchSourceSchema.parse({
  id: "123e4567-e89b-42d3-a456-426614174050",
  title: "A [source]",
  url: "https://example.org/a_(b)",
  finalUrl: "https://example.org/a_(b)",
  page: null,
  snippet: "Exact [snippet](https://hostile.example)",
  access: "html_excerpt",
  origin: "web",
  contentType: "text/html",
  byteLength: 20,
  contentHash: "a".repeat(64),
  content: "Exact source content",
  fetchedAt: "2026-09-06T00:00:00.000Z",
})

describe("research report source safety", () => {
  it("keeps selected source links and removes invented model links", () => {
    // Given
    const decision = researchModelDecisionSchema.parse({
      kind: "report",
      title: "Bounded report",
      markdown:
        "Supported [source](<https://example.org/a_(b)>); invented [claim](https://evil.example/path).\n\n[reference]: https://invented.example/source",
      sourceIds: [htmlSource.id],
    })

    // When
    const report = buildResearchReport(decision, [htmlSource])

    // Then
    expect(report.markdown).toContain("[source](<https://example.org/a_(b)>)")
    expect(report.markdown).not.toContain("https://evil.example")
    expect(report.markdown).not.toContain("https://invented.example")
    expect(report.markdown).toContain("unsupported source link removed")
    expect(report.markdown).toContain("## Source references")
    expect(report.markdown.startsWith(researchDraftNotice)).toBe(true)
    expect(report.markdown).toContain("[A \\[source\\]](<https://example.org/a_(b)>)")
    expect(report.markdown).not.toContain("https://hostile.example")
    expect(report.partial).toBe(true)
  })

  it("marks an unread PDF binary as partial evidence", () => {
    // Given
    const pdf = researchSourceSchema.parse({
      ...htmlSource,
      id: "123e4567-e89b-42d3-a456-426614174051",
      url: "https://example.org/paper.pdf",
      finalUrl: "https://example.org/paper.pdf",
      snippet: "Search metadata",
      access: "pdf_binary",
      contentType: "application/pdf",
      content: null,
    })
    const decision = researchModelDecisionSchema.parse({
      kind: "report",
      title: "PDF report",
      markdown: "The binary was downloaded but not read as passage text.",
      sourceIds: [pdf.id],
    })

    // When
    const report = buildResearchReport(decision, [pdf])

    // Then
    expect(report.partial).toBe(true)
    expect(report.markdown).toContain("PDF-binary")
    expect(report.citations[0]?.accessLabel).toBe("PDF binary only")
  })

  it("keeps provenance on a user-edited saved report without changing citations", () => {
    // Given
    const decision = researchModelDecisionSchema.parse({
      kind: "report",
      title: "Bounded report",
      markdown: "Generated claim.",
      sourceIds: [htmlSource.id],
    })
    const report = buildResearchReport(decision, [htmlSource])

    // When
    const input = reportNoteInput(
      researchJobIdSchema.parse("123e4567-e89b-42d3-a456-426614174099"),
      report,
      "Edited report",
      "User-edited claim with [source](<https://example.org/a_(b)>).",
    )

    // Then
    expect(input.body).toBe(
      `${researchDraftNotice}\n\nUser-edited claim with [source](<https://example.org/a_(b)>).`,
    )
    expect(input.metadata).toMatchObject({ research: { citations: report.citations } })
  })
})
