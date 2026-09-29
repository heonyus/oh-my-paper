import type { Workspace } from "../shared/schemas"
import { researchSidebarLayout } from "../shared/uiLayout"

export function defaultWorkspace(): Workspace {
  return {
    documents: [],
    cards: [],
    agentThreads: [],
    insights: [],
    readerNotes: [],
    sidebarOpen: true,
    outlineWidth: 240,
    researchSidebarWidth: researchSidebarLayout.contentDefault,
    uiFontFamily: "wanted",
    uiFontScale: 1,
    theme: "system",
    minimapVisible: true,
    viewport: { x: 88, y: 36, zoom: 0.9 },
    activeDocumentId: null,
  }
}
