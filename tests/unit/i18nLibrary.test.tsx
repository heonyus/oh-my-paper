import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { Topbar } from "../../src/renderer/components/AppChrome"
import { LibraryHome } from "../../src/renderer/components/LibraryHome"
import { LibraryTaskQueue } from "../../src/renderer/components/LibraryTaskQueue"
import { formatImportedAt } from "../../src/renderer/components/library-home-formatting"
import { OutlinePanel } from "../../src/renderer/components/OutlinePanel"
import { LocaleProvider } from "../../src/renderer/lib/locale"
import { completedPreparation } from "../../src/renderer/lib/preparationState"
import { chromeMessages } from "../../src/renderer/messages/chrome"
import { libraryMessages } from "../../src/renderer/messages/library"
import { snapshotOfAnalysisJobs } from "../../src/shared/documentAnalysis"
import {
  documentKindLabels,
  documentKindMessages,
  documentKindName,
} from "../../src/shared/documentKind"
import { documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"
import { createLocalImporter } from "../../src/web/localImport"
import { expectCompleteCatalog } from "../support/i18nCatalog"

vi.mock("../../src/renderer/components/DocumentThumbnail", () => ({
  DocumentThumbnail: () => <div data-testid="document-thumbnail" />,
}))

const report = documentRecordSchema.parse({
  id: "aabbccddeeff0011",
  name: "clinical-report.pdf",
  hash: "a".repeat(64),
  bytes: 1024,
  importedAt: "2026-08-30T12:00:00.000Z",
  pageCount: 18,
  title: "Clinical Data Quality Report",
  authors: [],
  year: null,
  doi: null,
  kind: "report",
  quality: { textCharacters: 4000, needsOcr: true, warnings: [] },
})

const manual = documentRecordSchema.parse({
  ...report,
  id: "bbccddeeff001122",
  name: "device-manual.pdf",
  hash: "b".repeat(64),
  title: "Device Setup Guide",
  kind: "manual",
})

function inEnglish(element: ReactElement) {
  return render(<LocaleProvider initialPreference="en">{element}</LocaleProvider>)
}

describe("library and chrome wording", () => {
  it("has every message in both languages with matching placeholders", () => {
    expectCompleteCatalog(libraryMessages)
    expectCompleteCatalog(chromeMessages)
    expectCompleteCatalog(documentKindMessages)
  })

  it("names document kinds per language and keeps the AI's Korean labels", () => {
    expect(documentKindName("presentation", "ko")).toBe("발표 자료")
    expect(documentKindName("presentation", "en")).toBe("Slides")
    expect(documentKindLabels.presentation).toBe("프레젠테이션")
  })

  it("formats import dates and preparation steps in the chosen language", () => {
    expect(formatImportedAt(report.importedAt, "en")).toBe("Aug 30, 2026")
    expect(formatImportedAt(report.importedAt, "ko")).toBe("2026. 8. 30.")
    const summary = {
      pages: 18,
      title: report.title,
      textCharacters: 4000,
      anchorCount: 10,
      needsOcr: false,
      kind: "report",
    } as const
    expect(completedPreparation(summary, "en").at(-1)?.message).toBe("Board ready")
    expect(completedPreparation(summary, "ko").at(-1)?.message).toBe("보드 준비 완료")
  })

  it("reports browser import errors in the page's language", async () => {
    const importer = createLocalImporter(() => "en")
    await expect(importer.importDocumentPath("missing")).rejects.toThrow(
      "Choose the file to import again.",
    )
  })
})

describe("in English", () => {
  it("shows the library home", () => {
    inEnglish(
      <LibraryHome
        documents={[manual, report]}
        activeId={report.id}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onFileDrop={vi.fn()}
        recentDocumentId={report.id}
        recentPage={7}
      />,
    )

    expect(screen.getByRole("region", { name: "PDF library" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Import PDF" })).toBeVisible()
    expect(screen.getByRole("searchbox", { name: "Search library" })).toHaveAttribute(
      "placeholder",
      "Search titles, authors, file names",
    )
    expect(screen.getByRole("heading", { name: "All documents" })).toBeVisible()
    expect(screen.getByText("2 documents")).toBeVisible()
    expect(screen.getByRole("region", { name: "Continue reading" })).toHaveTextContent(
      "Page 7 / 18",
    )

    const detail = screen.getByRole("region", { name: "Document details" })
    expect(detail).toHaveTextContent("Read PDF")
    expect(detail).toHaveTextContent("Report · 18 pages · 1KB")
    expect(detail).toHaveTextContent("Unknown authors")
    expect(detail).toHaveTextContent("Aug 30, 2026")
    expect(detail).toHaveTextContent("This document may need OCR.")

    fireEvent.click(screen.getByText("Filter by type"))
    fireEvent.click(screen.getByRole("button", { name: "Manual" }))
    expect(screen.getByRole("heading", { name: "Manual" })).toBeVisible()
    expect(screen.getByText("1 document")).toBeVisible()
    expect(screen.getByRole("button", { name: `Open ${manual.title}` })).toHaveTextContent("Open")
    expect(screen.getByText("Year unknown · Manual")).toBeVisible()
  })

  it("shows import and analysis progress", () => {
    inEnglish(
      <LibraryTaskQueue
        imports={[]}
        analyses={snapshotOfAnalysisJobs([
          {
            id: report.id,
            title: report.title,
            pageCount: 18,
            completedPages: 4,
            currentPage: 5,
            stage: "document-analyzing",
            engine: "local",
            attempt: 2,
            maxAttempts: 2,
            state: "running",
          },
        ])}
      />,
    )

    expect(screen.getByRole("region", { name: "PDF preparation progress" })).toBeVisible()
    expect(screen.getByText("1 in progress")).toBeVisible()
    expect(
      screen.getByText("5 / 18 pages · Local PaddleOCR · attempt 2/2 · Analyzing structure"),
    ).toBeVisible()
  })

  it("labels the reader toolbar and outline", () => {
    inEnglish(
      <>
        <Topbar
          documents={[]}
          activeDocumentId={documentIdSchema.parse("aabbccddeeff0011")}
          onDocumentChange={vi.fn()}
          viewport={{ x: 0, y: 0, zoom: 1 }}
          onViewportChange={vi.fn()}
          tool="select"
          onToolChange={vi.fn()}
          canUndo
          canRedo
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          outlineOpen={false}
          onToggleOutline={vi.fn()}
          noteOpen={false}
          onToggleNote={vi.fn()}
        />
        <OutlinePanel currentPage={1} outline={[]} onJump={vi.fn()} onClose={vi.fn()} />
      </>,
    )

    expect(screen.getByRole("combobox", { name: "Paper" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "No paper open" })).toBeInTheDocument()
    for (const name of ["Open contents", "Open my note", "Pan tool", "Undo", "Zoom in"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument()
    }
    expect(screen.getByRole("button", { name: "Turn on auto-translate" })).toHaveTextContent(
      "Auto-translate",
    )
    expect(screen.getByRole("complementary", { name: "Table of contents" })).toHaveTextContent(
      "No table of contents",
    )
  })
})
