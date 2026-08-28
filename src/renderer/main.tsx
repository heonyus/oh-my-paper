import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "pdfjs-dist/web/pdf_viewer.css"
import "./styles.css"
import "./components/metadata-sidebar.css"
import "./components/outline-panel.css"
import "./components/research-sidebar.css"
import "./components/ai-overview.css"
import "./components/board-index.css"
import "./components/citation-panel.css"

const root = document.getElementById("root")
if (!root) throw new Error("Scourgify root element is missing")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
