import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { App } from "../../src/web/App"

const mocks = vi.hoisted(() => ({ install: vi.fn() }))

vi.mock("../../src/web/authClient", () => ({
  authClient: {
    useSession: () => ({
      isPending: false,
      data: { user: { id: "web-user-1", name: "Researcher" } },
    }),
    signOut: vi.fn(),
  },
}))

vi.mock("../../src/web/useDocuments", () => ({
  useDocuments: () => ({
    documents: [],
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
  }),
}))

vi.mock("../../src/web/webOhMyPaperApi", () => ({
  installWebOhMyPaperApi: mocks.install,
}))

vi.mock("../../src/web/useHostedCredentials", () => ({
  useHostedCredentials: () => ({
    status: {
      providers: {
        gemini: { source: "shared", model: "gemini-3.5-flash-lite" },
        groq: { source: "missing", model: "openai/gpt-oss-20b" },
      },
      preferredTextProvider: "gemini",
    },
    error: null,
    save: vi.fn(async () => {}),
  }),
}))

vi.mock("../../src/renderer/App", () => ({
  App: () => <main>Research Board</main>,
}))

describe("web workspace parity", () => {
  it("mounts the research board instead of the reduced split reader", async () => {
    render(<App />)

    expect(await screen.findByText("Research Board")).toBeVisible()
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledWith("web-user-1"))
    expect(screen.queryByText("PRIVATE PAPER LIBRARY")).not.toBeInTheDocument()
  })
})
