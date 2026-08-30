import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  PaperStructureOverlay,
  resolveEquationActionSide,
  resolveObjectActionSide,
} from "../../src/renderer/components/PaperStructureOverlay"
import type { DetectedStructure } from "../../src/renderer/lib/structureDetector"

const figure: DetectedStructure = {
  id: "figure-1",
  kind: "figure",
  page: 1,
  title: "Figure 1 해설",
  quote: "Agent architecture",
  bounds: { x: 100, y: 120, width: 240, height: 160 },
}

const citation: DetectedStructure = {
  id: "citation-12",
  kind: "citation",
  page: 2,
  title: "인용 논문 [12]",
  quote: "Prior work [12]",
  bounds: { x: 140, y: 200, width: 60, height: 18 },
  reference: {
    key: "12",
    title: "A Memory Retrieval Paper",
    authors: "Jane Doe",
    year: 2024,
    venue: "KDD",
    rawText: "[12] Jane Doe. A Memory Retrieval Paper.",
  },
}

const equation: DetectedStructure = {
  id: "equation-1",
  kind: "equation",
  page: 1,
  title: "Equation (1) 해설",
  quote: "a_i = f(x)",
  bounds: { x: 130, y: 140, width: 100, height: 24 },
}

const section: DetectedStructure = {
  id: "section-3",
  kind: "section",
  page: 3,
  title: "3 Methods",
  quote: "3 Methods",
  bounds: { x: 60, y: 90, width: 90, height: 18 },
}

describe("PaperStructureOverlay", () => {
  it("moves equation actions to the visible side when the preferred margin is clipped", () => {
    expect(resolveEquationActionSide("left", 6, 620)).toBe("right")
    expect(resolveEquationActionSide("right", 620, 6)).toBe("left")
  })

  it("moves object actions to the margin with enough control width", () => {
    expect(resolveObjectActionSide("right", 180, 20, false)).toBe("left")
    expect(resolveObjectActionSide("right", 20, 50, true)).toBe("right")
  })

  it("activates the owning structure when an invisible action intercepts pointer movement", () => {
    const host = document.createElement("div")
    host.className = "page"
    document.body.append(host)
    const view = render(
      <PaperStructureOverlay
        structures={[figure]}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
      { container: host },
    )
    const region = host.querySelector<HTMLElement>(".structure-hover-region")
    const button = screen.getByRole("button", { name: /Figure 1 해설 AI 그림 해설/u })

    fireEvent.pointerMove(button, { clientX: 330, clientY: 260 })

    expect(region).toHaveAttribute("data-active", "true")
    view.unmount()
    host.remove()
  })

  it("keeps hover active while moving from a PDF page into its sibling action overlay", () => {
    const page = document.createElement("div")
    page.className = "page"
    Object.defineProperty(page, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 1000, width: 800, height: 1000 }),
    })
    const overlayHost = document.createElement("div")
    document.body.append(page, overlayHost)
    const view = render(
      <PaperStructureOverlay
        structures={[equation]}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
      { container: overlayHost },
    )
    const region = overlayHost.querySelector<HTMLElement>(".structure-hover-region")
    const button = screen.getByRole("button", { name: /Equation \(1\) 해설 AI 수식 해설/u })
    Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true })
    Object.defineProperty(region, "getBoundingClientRect", {
      value: () => ({ left: 130, top: 140, right: 230, bottom: 164, width: 100, height: 24 }),
    })

    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 })
    expect(region).toHaveAttribute("data-active", "true")
    fireEvent.pointerMove(button, { clientX: 240, clientY: 170 })

    expect(region).toHaveAttribute("data-active", "true")
    view.unmount()
    page.remove()
    overlayHost.remove()
  })

  it("keeps a margin action alive while the pointer crosses the empty corridor", () => {
    vi.useFakeTimers()
    const view = render(
      <PaperStructureOverlay
        structures={[figure]}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
    )
    const region = document.querySelector<HTMLElement>(".structure-hover-region")
    const button = screen.getByRole("button", { name: /Figure 1 해설 AI 그림 해설/u })
    if (!region) throw new Error("structure hover region is missing")

    fireEvent.pointerMove(region)
    fireEvent.pointerMove(document.body)
    act(() => vi.advanceTimersByTime(200))
    expect(region).toHaveAttribute("data-active", "true")
    fireEvent.pointerMove(button)
    act(() => vi.advanceTimersByTime(300))
    expect(region).toHaveAttribute("data-active", "true")

    view.unmount()
    vi.useRealTimers()
  })

  it("prefers the smallest overlapping structure at the pointer", () => {
    const host = document.createElement("div")
    document.body.append(host)
    render(
      <PaperStructureOverlay
        structures={[figure, equation]}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
      { container: host },
    )
    const regions = host.querySelectorAll<HTMLElement>(".structure-hover-region")
    Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true })
    Object.defineProperty(regions[0], "getBoundingClientRect", {
      value: () => ({ left: 100, top: 120, right: 340, bottom: 280, width: 240, height: 160 }),
    })
    Object.defineProperty(regions[1], "getBoundingClientRect", {
      value: () => ({ left: 130, top: 140, right: 230, bottom: 164, width: 100, height: 24 }),
    })

    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 })

    expect(regions[0]).toHaveAttribute("data-active", "false")
    expect(regions[1]).toHaveAttribute("data-active", "true")
    host.remove()
  })

  it("places equation actions outside the math bounds without visible button labels", () => {
    render(
      <PaperStructureOverlay
        structures={[equation]}
        pageWidth={800}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
    )

    const region = document.querySelector(".structure-hover-region")
    const explain = screen.getByRole("button", { name: /Equation \(1\) 해설 AI 수식 해설/u })
    expect(region).toHaveAttribute("data-action-side", "left")
    expect(explain).toHaveTextContent("")
    expect(explain).toHaveAttribute("title", "AI 수식 해설")
  })

  it("runs the figure explanation action from its hover target", () => {
    const onTrigger = vi.fn()
    render(
      <PaperStructureOverlay
        structures={[figure]}
        onTrigger={onTrigger}
        onCopy={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Figure 1 해설 AI 그림 해설/u }))

    expect(onTrigger).toHaveBeenCalledWith(figure)
    const stroke = document.querySelector(".structure-screen-stroke")
    expect(stroke).toHaveAttribute("width", "100%")
    expect(stroke).toHaveAttribute("height", "100%")
  })

  it("marks narrow figures for compact icon-only actions", () => {
    render(
      <PaperStructureOverlay
        structures={[{ ...figure, bounds: { ...figure.bounds, width: 100 } }]}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
    )

    expect(document.querySelector(".structure-hover-region")).toHaveAttribute(
      "data-compact-actions",
      "true",
    )
    const region = document.querySelector<HTMLElement>(".structure-hover-region")
    if (!region) throw new Error("compact Figure region is missing")
    fireEvent.pointerMove(region)
    expect(screen.getByRole("button", { name: /Figure 1 해설 AI 그림 해설/u })).toHaveAttribute(
      "title",
      "AI 그림 해설",
    )
    expect(screen.getByRole("button", { name: /Figure 1 해설 복사/u })).toHaveAttribute(
      "title",
      "그림 복사",
    )
  })

  it("uses compact actions on the preferred side instead of jumping across a text column", () => {
    render(
      <PaperStructureOverlay
        structures={[{ ...figure, bounds: { ...figure.bounds, x: 60, width: 400 } }]}
        pageWidth={800}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
    )

    const region = document.querySelector(".structure-hover-region")
    expect(region).toHaveAttribute("data-compact-actions", "true")
    expect(region).toHaveAttribute("data-object-action-side", "left")
  })

  it("keeps labelled figure actions on the preferred side when it has enough width", () => {
    render(
      <PaperStructureOverlay
        structures={[{ ...figure, bounds: { ...figure.bounds, x: 180 } }]}
        pageWidth={800}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
    )

    const region = document.querySelector(".structure-hover-region")
    expect(region).toHaveAttribute("data-compact-actions", "false")
    expect(region).toHaveAttribute("data-object-action-side", "left")
  })

  it("keeps the section affordance icon-only so it cannot cover the heading", () => {
    render(
      <PaperStructureOverlay
        structures={[section]}
        onTrigger={vi.fn()}
        onCopy={vi.fn(async () => {})}
      />,
    )

    const button = screen.getByRole("button", { name: "3 Methods AI 섹션 해설" })
    expect(button).toHaveTextContent("")
    expect(button).toHaveAttribute("title", "AI 섹션 해설")
  })

  it("shows a smart citation preview and adds it to the board", () => {
    const onTrigger = vi.fn()
    render(
      <PaperStructureOverlay
        structures={[citation]}
        onTrigger={onTrigger}
        onCopy={vi.fn(async () => {})}
      />,
    )
    const citationButton = screen.getByRole("button", { name: /인용 논문 \[12\] 인용 논문 보기/u })

    fireEvent.pointerEnter(citationButton)
    expect(screen.getByText("A Memory Retrieval Paper")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Smart Citation 카드 만들기/u }))

    expect(onTrigger).toHaveBeenCalledWith(citation)
  })
})
it("copies figure feature on copy button click", async () => {
  const onCopy = vi.fn(async () => {})
  render(<PaperStructureOverlay structures={[figure]} onTrigger={vi.fn()} onCopy={onCopy} />)
  const aiButton = screen.getByRole("button", { name: /Figure 1 해설 AI 그림 해설/u })
  fireEvent.pointerEnter(aiButton)
  const copyButton = screen.getByRole("button", { name: /Figure 1 해설 복사/u })
  await act(async () => {
    fireEvent.click(copyButton)
  })
  expect(onCopy).toHaveBeenCalledWith(figure)
})
