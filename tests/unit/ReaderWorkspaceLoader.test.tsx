import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { ReaderWorkspace, warmReader } from "../../src/renderer/components/ReaderWorkspaceLoader"

vi.mock("../../src/renderer/components/ReaderWorkspace", () => ({
  ReaderWorkspace: () => <p>reader</p>,
}))

const props = { fallback: <p>opening</p> } as ComponentProps<typeof ReaderWorkspace>

describe("reader workspace loader", () => {
  it("shows the fallback until the reader's code is in, then the reader", async () => {
    const cold = render(<ReaderWorkspace {...props} />)
    expect(screen.getByText("opening")).toBeVisible()
    expect(await screen.findByText("reader")).toBeVisible()
    expect(screen.queryByText("opening")).not.toBeInTheDocument()
    cold.unmount()
  })

  it("draws the reader at once, with no opening line, once it has been warmed", async () => {
    await warmReader()
    render(<ReaderWorkspace {...props} />)
    expect(screen.getByText("reader")).toBeVisible()
    expect(screen.queryByText("opening")).not.toBeInTheDocument()
  })
})
