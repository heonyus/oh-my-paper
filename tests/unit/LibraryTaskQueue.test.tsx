import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { LibraryTaskQueue } from "../../src/renderer/components/LibraryTaskQueue"
import {
  documentAnalysisJobSchema,
  emptyDocumentAnalysisSnapshot,
  snapshotOfAnalysisJobs,
} from "../../src/shared/documentAnalysis"

it("collapses completed import details so they do not cover the selected document", () => {
  render(
    <LibraryTaskQueue
      imports={[
        {
          id: "73fcb8ab-9085-4f88-af36-f4d25cdd2364",
          fileName: "paper.pdf",
          stage: "layout",
          state: "complete",
          progress: 1,
          message: "준비 완료",
        },
      ]}
      analyses={emptyDocumentAnalysisSnapshot}
    />,
  )
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "완료 내역" }))
  expect(screen.getByRole("progressbar", { name: "paper.pdf 준비 진행" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  )
  fireEvent.click(screen.getByRole("button", { name: "접기" }))
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
})

it("counts analysis jobs beyond the listed ones so a whole library can queue", () => {
  const job = (index: number, state: "queued" | "failed") =>
    documentAnalysisJobSchema.parse({
      id: index.toString(16).padStart(16, "0"),
      title: `paper-${index}.pdf`,
      pageCount: 4,
      completedPages: 0,
      state,
      ...(state === "failed" ? { message: "문서 구조 분석을 완료하지 못했습니다" } : {}),
    })
  const analyses = snapshotOfAnalysisJobs([
    ...Array.from({ length: 70 }, (_, index) => job(index + 1, "queued")),
    job(100, "failed"),
    job(101, "failed"),
  ])
  expect(analyses.jobs).toHaveLength(64)
  expect(analyses.jobs.slice(0, 2).map((listed) => listed.state)).toEqual(["failed", "failed"])
  expect(analyses.unlisted).toEqual({ queued: 8, running: 0, failed: 0 })

  render(<LibraryTaskQueue imports={[]} analyses={analyses} />)

  expect(screen.getByText("70개 진행 중")).toBeVisible()
  expect(screen.getAllByRole("listitem")).toHaveLength(65)
  expect(screen.getByText("외 8개 문서")).toBeVisible()
  expect(screen.getByText("8개 분석 대기 중")).toBeVisible()
})
