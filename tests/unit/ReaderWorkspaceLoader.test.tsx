import { render, screen } from "@testing-library/react"
import { type ComponentProps, Suspense } from "react"
import { describe, expect, it, vi } from "vitest"
import { ReaderWorkspace, warmReader } from "../../src/renderer/components/ReaderWorkspaceLoader"

vi.mock("../../src/renderer/components/ReaderWorkspace", () => ({
  ReaderWorkspace: () => <p>reader</p>,
}))

const props = {} as ComponentProps<typeof ReaderWorkspace>

function renderReader() {
  return render(
    <Suspense fallback={<p>opening</p>}>
      <ReaderWorkspace {...props} />
    </Suspense>,
  )
}

describe("reader workspace loader", () => {
  it("loads lazily until warmed, then draws with no opening line in between", async () => {
    const cold = renderReader()
    expect(screen.getByText("opening")).toBeVisible()
    expect(await screen.findByText("reader")).toBeVisible()
    cold.unmount()

    await warmReader()
    renderReader()
    expect(screen.getByText("reader")).toBeVisible()
    expect(screen.queryByText("opening")).not.toBeInTheDocument()
  })
})
