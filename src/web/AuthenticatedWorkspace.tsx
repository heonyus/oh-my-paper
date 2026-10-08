import "katex/dist/katex.min.css"
import "pdfjs-dist/web/pdf_viewer.css"
import "../renderer/styles.css"
import "../renderer/components/board-card.css"
import "../renderer/components/metadata-sidebar.css"
import "../renderer/components/outline-panel.css"
import "../renderer/components/research-sidebar.css"
import "../renderer/components/ai-overview.css"
import "../renderer/components/board-index.css"
import "../renderer/components/citation-panel.css"
import "../renderer/components/citation-preview.css"
import "../renderer/components/chat-composer.css"
import "../renderer/components/library-home.css"
import "../renderer/components/document-retrieval.css"
import "../renderer/components/document-find.css"
import "../renderer/components/page-translation.css"
import "../renderer/components/font-family-picker.css"
import "../renderer/components/hosted-credentials.css"
import "../renderer/research-shell.css"
import "../renderer/components/reader-workspace.css"
import { type JSX, useState } from "react"
import { App as ResearchApp } from "../renderer/App"
import { authClient } from "./authClient"
import { useHostedCredentials } from "./useHostedCredentials"
import { installWebOhMyPaperApi } from "./webOhMyPaperApi"

export function AuthenticatedWorkspace({
  user,
}: {
  readonly user: { readonly id: string; readonly name: string }
}): JSX.Element {
  useState(() => installWebOhMyPaperApi(user.id))
  const credentials = useHostedCredentials()
  return (
    <ResearchApp
      platform="web"
      account={{ name: user.name, onSignOut: () => void authClient.signOut() }}
      hostedCredentials={{
        status: credentials.status,
        error: credentials.error,
        onSave: credentials.save,
      }}
    />
  )
}
