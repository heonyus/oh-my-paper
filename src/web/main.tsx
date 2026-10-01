import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { type LanguagePreference, LocaleProvider } from "../renderer/lib/locale"
import { languageStatusSchema } from "../shared/i18n/locale"
import { installLocalReaderApi } from "./localReaderApi"
import { localRpc } from "./localTransport"
import { ReaderApp } from "./ReaderApp"
import "../shared/brand.css"
import "pdfjs-dist/web/pdf_viewer.css"
import "katex/dist/katex.min.css"
import "../renderer/styles.css"
import "../renderer/components/board-card.css"
import "../renderer/components/metadata-sidebar.css"
import "../renderer/components/outline-panel.css"
import "../renderer/components/research-sidebar.css"
import "../renderer/components/ai-overview.css"
import "../renderer/components/readerNote/reader-note.css"
import "../renderer/components/noteCard/note-card.css"
import "../renderer/components/board-index.css"
import "../renderer/components/citation-panel.css"
import "../renderer/components/citation-preview.css"
import "../renderer/components/chat-composer.css"
import "../renderer/components/library-home.css"
import "../renderer/components/document-retrieval.css"
import "../renderer/components/page-translation.css"
import "../renderer/components/font-family-picker.css"
import "../renderer/research-shell.css"
import "../renderer/components/reader-workspace.css"
import "./local-reader.css"
import "./web-onboarding.css"
import "./tips/feature-tips.css"
import "./star/star-invite.css"
import "./research/research.css"

const root = document.getElementById("root")
if (!root) throw new Error("oh-my-paper web root is missing")
const mount = root
installLocalReaderApi()

/**
 * The language picked in the terminal or in settings is kept with the app's data, so it wins over
 * what this browser remembers. A slow or missing answer leaves the browser's own choice.
 */
async function savedLanguage(): Promise<LanguagePreference | undefined> {
  try {
    const { language } = await Promise.race([
      localRpc("languageStatus", {}, languageStatusSchema),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ])
    return language === "auto" ? undefined : language
  } catch {
    return undefined
  }
}

function keepLanguage(language: LanguagePreference): void {
  void localRpc("saveLanguage", { language }, languageStatusSchema).catch(() => undefined)
}

void savedLanguage().then((initialPreference) => {
  createRoot(mount).render(
    <StrictMode>
      <LocaleProvider initialPreference={initialPreference} onPreferenceChange={keepLanguage}>
        <ReaderApp />
      </LocaleProvider>
    </StrictMode>,
  )
})
