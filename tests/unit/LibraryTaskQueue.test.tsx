import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { LibraryTaskQueue } from "../../src/renderer/components/LibraryTaskQueue"

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
      analyses={[]}
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
