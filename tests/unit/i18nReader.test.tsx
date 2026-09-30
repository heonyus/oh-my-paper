import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BoardCardChat } from "../../src/renderer/components/BoardCardChat"
import { BoardIndexPanel } from "../../src/renderer/components/BoardIndexPanel"
import { PageTranslationTrigger } from "../../src/renderer/components/PageTranslationTrigger"
import { ReaderNotePane } from "../../src/renderer/components/readerNote/ReaderNotePane"
import { SlashMenu } from "../../src/renderer/components/readerNote/SlashMenu"
import {
  matchingSlashItems,
  SlashMenuStore,
} from "../../src/renderer/components/readerNote/slashCommands"
import { createPostIt, createSelectionCard } from "../../src/renderer/lib/board"
import { LocaleProvider } from "../../src/renderer/lib/locale"
import {
  pageTranslationFailureMessage,
  parserStageMessage,
} from "../../src/renderer/lib/pageTranslationPaneState"
import { PaperAiJobError } from "../../src/renderer/lib/usePaperAiRequest"
import { boardMessages } from "../../src/renderer/messages/board"
import { noteMessages } from "../../src/renderer/messages/note"
import { readerMessages } from "../../src/renderer/messages/reader"
import { boardCardSchema, documentIdSchema, documentRecordSchema } from "../../src/shared/schemas"
import { expectCompleteCatalog } from "../support/i18nCatalog"

const english = ({ children }: { readonly children: ReactNode }) => (
  <LocaleProvider initialPreference="en">{children}</LocaleProvider>
)

const card = boardCardSchema.parse({
  id: "42ad8d84-c1ee-45b4-a022-6cf0d4c14278",
  documentId: "aabbccddeeff0011",
  kind: "explanation",
  title: "Abstract",
  body: "cached explanation",
  x: 800,
  y: 240,
  minimized: false,
  anchor: {
    page: 1,
    quote: "Abstract",
    x: 420,
    y: 180,
    fragments: [{ x: 420, y: 180, width: 80, height: 18 }],
  },
})

const selection = {
  page: 3,
  quote: "The model improves recall on long documents.",
  fragments: [{ x: 420, y: 180, width: 160, height: 18 }],
  cardPosition: { x: 612, y: 162 },
  context: { before: "", after: "" },
}

describe("reader wording", () => {
  it("has every reader, board and note message in both languages", () => {
    expectCompleteCatalog(readerMessages)
    expectCompleteCatalog(boardMessages)
    expectCompleteCatalog(noteMessages)
  })

  it("words page translation progress and failures in the chosen language", () => {
    expect(parserStageMessage("finalizing", "en")).toBe("Gathering the sentences to translate.")
    expect(parserStageMessage("finalizing")).toBe("번역할 문장들을 정리하고 있습니다.")
    expect(pageTranslationFailureMessage(new PaperAiJobError("timeout"), "en")).toBe(
      "The AI didn't respond in time.",
    )
    expect(pageTranslationFailureMessage(new Error("other"), "en")).toBeNull()
  })

  it("names new cards in the language they are made in", () => {
    const documentId = documentIdSchema.parse("aabbccddeeff0011")
    expect(createSelectionCard(documentId, selection, "explanation", "en")?.title).toBe(
      "Passage explanation",
    )
    expect(createSelectionCard(documentId, selection, "explanation")?.title).toBe("선택 구절 설명")
    expect(createPostIt(documentId, 1, { x: 0, y: 0 }, "en").title).toBe("Sticky note")
  })

  it("matches slash blocks by their name in the reader's language", () => {
    expect(matchingSlashItems("numbered", "en").map((item) => item.id)).toEqual(["ordered"])
    expect(matchingSlashItems("번호").map((item) => item.id)).toEqual(["ordered"])
    expect(matchingSlashItems("번호", "en")).toEqual([])
  })
})

describe("reader in English", () => {
  it("asks a card follow-up and reports a failed answer in English", async () => {
    const onChange = vi.fn()
    const onAsk = vi.fn(async () => {
      throw new Error("offline")
    })
    render(<BoardCardChat card={card} onChange={onChange} onAsk={onAsk} />, { wrapper: english })

    expect(screen.getByRole("region", { name: "Follow-up questions" })).toBeVisible()
    await userEvent.type(screen.getByLabelText("Ask a follow-up about this card"), "Limits?")
    await userEvent.click(screen.getByRole("button", { name: "Send follow-up" }))

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        { role: "user", content: "Limits?" },
        { role: "assistant", content: "Check your AI settings, then send again." },
      ]),
    )
  })

  it("labels the page translation trigger in English", () => {
    render(<PageTranslationTrigger page={3} />, { wrapper: english })

    expect(screen.getByRole("button", { name: "Open translation of p. 3" })).toHaveTextContent(
      "Translate page",
    )
  })

  it("explains an empty board category in English", () => {
    render(<BoardIndexPanel cards={[]} kind="sticky" label="Sticky notes" onJump={vi.fn()} />, {
      wrapper: english,
    })

    expect(screen.getByRole("region", { name: "Sticky notes index" })).toBeVisible()
    expect(screen.getByText("Nothing saved yet.")).toBeVisible()
    expect(
      screen.getByText("Click the board with the sticky note tool, and quick notes appear here."),
    ).toBeVisible()
  })

  it("lists slash blocks with English names and hints", () => {
    const store = new SlashMenuStore()
    store.set({
      items: matchingSlashItems("list", "en"),
      index: 0,
      rect: new DOMRect(10, 10, 0, 16),
      choose: vi.fn(),
    })
    render(<SlashMenu store={store} />, { wrapper: english })

    expect(screen.getByRole("listbox", { name: "Add block" })).toBeVisible()
    expect(screen.getByRole("option", { name: "Bulleted list List with bullets" })).toBeVisible()
    expect(screen.getByRole("option", { name: "Numbered list List in order" })).toBeVisible()
  })
})

describe("reader note in English", () => {
  let stored: Map<string, string>
  beforeEach(() => {
    stored = new Map([["ohmypaper:note-companion", "quiet"]])
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    })
    Object.defineProperty(window, "ohmypaper", {
      configurable: true,
      value: {
        rankByMeaning: vi.fn(async () => ({ model: "test", results: [] })),
        meaningSearchStatus: vi.fn(async () => ({ state: "ready" })),
      },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, "ohmypaper", { configurable: true, value: undefined })
  })

  it("shows the note pane, its margin choices and its editor in English", () => {
    render(
      <ReaderNotePane
        document={documentRecordSchema.parse({
          id: "aabbccddeeff0011",
          name: "Paper.pdf",
          hash: "a".repeat(64),
          bytes: 1024,
          importedAt: "2026-08-27T00:00:00.000Z",
          pageCount: 2,
          title: "Paper",
          authors: [],
          year: 2026,
          doi: null,
          quality: { textCharacters: 2000, needsOcr: false, warnings: [] },
        })}
        note={undefined}
        currentPage={1}
        earlierNotes={[]}
        onAiRequest={vi.fn(async () => "")}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onNavigateToSource={vi.fn()}
        pendingQuote={null}
        onPendingQuoteHandled={vi.fn()}
      />,
      { wrapper: english },
    )

    expect(screen.getByRole("heading", { name: "My note" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Close note" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Quiet" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Active" })).toBeVisible()
    const body = screen.getByLabelText("My note text")
    expect(body).toHaveAttribute("contenteditable", "true")
    expect(body.querySelector("[data-placeholder]")).toHaveAttribute(
      "data-placeholder",
      "Write in your own words. Type / to pick a block",
    )
  })
})
