import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { installLocalReaderApi } from "./localReaderApi"
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
installLocalReaderApi()

createRoot(root).render(
  <StrictMode>
    <ReaderApp />
  </StrictMode>,
)
