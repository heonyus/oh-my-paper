import { type JSX, useEffect, useRef, useState } from "react"
import { currentLocale, useTranslator } from "../../renderer/lib/locale"
import {
  type AgentMode,
  type AgentPaper,
  type AgentStep,
  type AgentThread,
  agentHistoryFromMessages,
  threadTitleFromQuestion,
} from "../../shared/agentChat"
import type { DocumentId, Workspace } from "../../shared/schemas"
import { appendMessage, createThread, upsertThread } from "./agentThreadModel"
import { researchViewMessages } from "./messages"
import { type PaperOpenState, paperKey } from "./ResearchPaperCard"
import { ResearchRail } from "./ResearchRail"
import { ResearchThread } from "./ResearchThread"

export function ResearchView({
  workspace,
  onWorkspaceChange,
  onOpenImportedDocument,
}: {
  readonly workspace: Workspace
  readonly onWorkspaceChange: (update: (current: Workspace) => Workspace) => void
  readonly onOpenImportedDocument: (id: DocumentId) => void
}): JSX.Element {
  const t = useTranslator(researchViewMessages)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [attachedIds, setAttachedIds] = useState<readonly DocumentId[]>([])
  const [sending, setSending] = useState(false)
  const [liveSteps, setLiveSteps] = useState<readonly AgentStep[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [mode, setMode] = useState<AgentMode>("quick")
  const controllerRef = useRef<AbortController | null>(null)
  const [paperOpenStates, setPaperOpenStates] = useState<Readonly<Record<string, PaperOpenState>>>(
    {},
  )

  useEffect(() => () => controllerRef.current?.abort(), [])

  const threads = workspace.agentThreads
  const active = threads.find((thread) => thread.id === activeId) ?? null

  // Runs can outlive this render (deep research takes minutes), so always merge into the
  // latest workspace instead of the one captured when the question was sent.
  const persistThread = (thread: AgentThread): void => {
    onWorkspaceChange((current) => ({
      ...current,
      agentThreads: upsertThread(current.agentThreads, thread),
    }))
  }

  const selectThread = (id: string | null): void => {
    setActiveId(id)
    setError(null)
    setCancelled(false)
    const thread = id ? threads.find((existing) => existing.id === id) : null
    setAttachedIds(thread?.contextDocIds ?? [])
  }

  const attach = (id: DocumentId): void => {
    if (attachedIds.includes(id)) return
    const next = [...attachedIds, id]
    setAttachedIds(next)
    if (active) persistThread({ ...active, contextDocIds: next })
  }

  const detach = (id: DocumentId): void => {
    const next = attachedIds.filter((existing) => existing !== id)
    setAttachedIds(next)
    if (active) persistThread({ ...active, contextDocIds: next })
  }

  const send = async (question: string, requestedMode: AgentMode = mode): Promise<void> => {
    if (sending) return
    const controller = new AbortController()
    controllerRef.current = controller
    const base =
      active ?? createThread(crypto.randomUUID(), threadTitleFromQuestion(question), attachedIds)
    const history = agentHistoryFromMessages(base.messages)
    const withUser = appendMessage(base, { role: "user", content: question })
    if (!active) {
      setActiveId(withUser.id)
      setAttachedIds(withUser.contextDocIds)
    }
    persistThread(withUser)
    setSending(true)
    setLiveSteps([])
    setError(null)
    setCancelled(false)
    const steps: AgentStep[] = []
    try {
      const result = await window.ohmypaper.agentAskStream(
        {
          question,
          contextDocIds: withUser.contextDocIds,
          history,
          mode: requestedMode,
          language: currentLocale(),
        },
        (step) => {
          const index = steps.findIndex((existing) => existing.id === step.id)
          if (index === -1) steps.push(step)
          else steps[index] = step
          setLiveSteps([...steps])
        },
        controller.signal,
      )
      const done = appendMessage(withUser, {
        role: "assistant",
        content: result.answer,
        papers: result.papers,
        steps: steps.slice(-64),
        mode: requestedMode,
      })
      persistThread(done)
    } catch (cause) {
      if (controller.signal.aborted) setCancelled(true)
      else setError(cause instanceof Error ? cause.message : t("research.answerFailed"))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setSending(false)
      setLiveSteps([])
    }
  }

  const openInReader = async (paper: AgentPaper): Promise<void> => {
    if (!paper.fullTextUrl) return
    const key = paperKey(paper)
    setPaperOpenStates((states) => ({ ...states, [key]: "importing" }))
    try {
      const result = await window.ohmypaper.importDocumentUrl(paper.fullTextUrl)
      setPaperOpenStates((states) => ({ ...states, [key]: "idle" }))
      if (result) onOpenImportedDocument(result.document.id)
    } catch {
      setPaperOpenStates((states) => ({ ...states, [key]: "failed" }))
    }
  }

  return (
    <div className="research-view">
      <ResearchRail
        threads={threads}
        activeId={active?.id ?? null}
        onNew={() => selectThread(null)}
        onSelect={selectThread}
      />
      <section className="research-main" aria-label={t("research.label")}>
        <ResearchThread
          thread={active}
          documents={workspace.documents}
          attachedIds={attachedIds}
          sending={sending}
          mode={mode}
          onModeChange={setMode}
          onCancel={() => controllerRef.current?.abort()}
          liveSteps={liveSteps}
          error={error}
          cancelled={cancelled}
          paperOpenStates={paperOpenStates}
          onAttach={attach}
          onDetach={detach}
          onSend={(question, requestedMode) => void send(question, requestedMode)}
          onOpenInReader={(paper) => void openInReader(paper)}
        />
      </section>
    </div>
  )
}
