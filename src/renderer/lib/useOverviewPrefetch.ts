import { useEffect, useRef, useState } from "react"
import type { ProviderStatus } from "../../shared/ipc"
import type { DocumentId, DocumentInsightKind, Workspace } from "../../shared/schemas"
import { OVERVIEW_ACTIONS, prefetchPaperOverview } from "./paperOverview"
import { withDocumentInsight } from "./useDocumentInsights"
import type { WorkspaceSetter } from "./useWorkspaceHistory"

/** A paper imported this recently before the app opened still counts as just arrived. */
const RECENT_IMPORT_MS = 10 * 60_000
const OVERVIEW_KINDS = Object.keys(OVERVIEW_ACTIONS) as DocumentInsightKind[]

function missingKinds(workspace: Workspace, documentId: DocumentId): DocumentInsightKind[] {
  const present = new Set(
    workspace.insights
      .filter((insight) => insight.documentId === documentId)
      .map((insight) => insight.kind),
  )
  return OVERVIEW_KINDS.filter((kind) => !present.has(kind))
}

/**
 * Writes the AI overview of every paper that arrives, in the background and one paper at a
 * time, so it is ready when the paper is first opened instead of starting only then. Papers
 * already in the library are left to the AI 개요 panel, as before.
 */
export function useOverviewPrefetch(
  workspace: Workspace | null,
  provider: ProviderStatus,
  setWorkspace: WorkspaceSetter,
): void {
  const latest = useRef(workspace)
  const known = useRef<Set<DocumentId> | null>(null)
  const queue = useRef<DocumentId[]>([])
  const running = useRef(false)
  // Bumped whenever a paper joins the queue or a paper's overview is done.
  const [round, setRound] = useState(0)

  useEffect(() => {
    latest.current = workspace
    if (!workspace) return
    const arrived: DocumentId[] = []
    if (!known.current) {
      known.current = new Set(workspace.documents.map((document) => document.id))
      const now = Date.now()
      for (const document of workspace.documents)
        if (now - Date.parse(document.importedAt) < RECENT_IMPORT_MS) arrived.push(document.id)
    } else {
      for (const document of workspace.documents) {
        if (known.current.has(document.id)) continue
        known.current.add(document.id)
        arrived.push(document.id)
      }
    }
    if (arrived.length === 0) return
    queue.current.push(...arrived)
    setRound((value) => value + 1)
  }, [workspace])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` is the signal to take the next paper.
  useEffect(() => {
    if (!provider.configured || running.current) return
    const current = latest.current
    let document: Workspace["documents"][number] | undefined
    let missing: DocumentInsightKind[] = []
    while (current && queue.current.length > 0 && missing.length === 0) {
      const id = queue.current.shift()
      document = current.documents.find((candidate) => candidate.id === id)
      missing = document ? missingKinds(current, document.id) : []
    }
    if (!document || missing.length === 0) return
    const paper = document
    running.current = true
    void prefetchPaperOverview(paper, missing, provider, (kind, value) =>
      setWorkspace((workspace) =>
        workspace?.documents.some((candidate) => candidate.id === paper.id)
          ? withDocumentInsight(workspace, paper.id, kind, value)
          : workspace,
      ),
    ).finally(() => {
      running.current = false
      setRound((value) => value + 1)
    })
  }, [round, provider, setWorkspace])
}
