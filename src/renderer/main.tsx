import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AccountRoot } from "./AccountRoot"
import "pdfjs-dist/web/pdf_viewer.css"
import "../shared/brand.css"
import "./styles.css"
import "./components/board-card.css"
import "katex/dist/katex.min.css"
import "./components/metadata-sidebar.css"
import "./components/outline-panel.css"
import "./components/research-sidebar.css"
import "./components/ai-overview.css"
import "./components/readerNote/reader-note.css"
import "./components/board-index.css"
import "./components/citation-panel.css"
import "./components/citation-preview.css"
import "./components/chat-composer.css"
import "./components/library-home.css"
import "./components/document-retrieval.css"
import "./components/page-translation.css"
import "./components/font-family-picker.css"
import "./components/hosted-credentials.css"
import "./research-shell.css"
import "./components/reader-workspace.css"

const root = document.getElementById("root")
if (!root) throw new Error("oh-my-paper root element is missing")

createRoot(root).render(
  <StrictMode>
    <AccountRoot />
  </StrictMode>,
)
