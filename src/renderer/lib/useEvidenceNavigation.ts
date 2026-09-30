import { useCallback, useEffect, useRef, useState } from "react"
import type { EvidenceAnchorId } from "../../shared/knowledgeSchemas"
import type { EvidenceNavigationTarget } from "../../shared/knowledgeTypes"
import { readerMessages } from "../messages/reader"
import type { Workspace } from "../types"
import { evidenceDocument } from "./evidenceDocument"
import { evidenceFocusViewport } from "./evidenceFocus"
import type { KnowledgeClientOps } from "./knowledgeTypes"
import { useLocale, useTranslator } from "./locale"

type WorkspaceUpdate = Workspace | null | ((current: Workspace | null) => Workspace | null)

export function useEvidenceNavigation(input: {
  readonly client: KnowledgeClientOps
  readonly workspace: Workspace | null
  readonly readerVisible: boolean
  readonly updateWorkspace: (update: WorkspaceUpdate) => void
  readonly openReader: () => void
  readonly setPage: (page: number) => void
  readonly onError: (message: string) => void
}) {
  const { locale } = useLocale()
  const t = useTranslator(readerMessages)
  const [target, setTarget] = useState<EvidenceNavigationTarget | null>(null)
  const pending = useRef<EvidenceNavigationTarget | null>(null)
  const jump = useRef<(page: number) => void>(() => {})
  const generation = useRef(0)
  const frame = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
      cancelAnimationFrame(frame.current)
    },
    [],
  )
  const registerPageJump = useCallback((handler: (page: number) => void) => {
    jump.current = handler
  }, [])
  const focus = useCallback(
    (next: EvidenceNavigationTarget) => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const board = document.querySelector<HTMLElement>(".board-viewport")
        // biome-ignore lint/complexity/useLiteralKeys: DOMStringMap requires bracket access under noPropertyAccessFromIndexSignature
        if (!board || board.dataset["documentHash"] !== next.hash) return
        jump.current(next.page)
        input.updateWorkspace((current) => {
          if (!current) return current
          const viewport = evidenceFocusViewport(
            current.viewport,
            {
              width: board.clientWidth,
              height: board.clientHeight,
            },
            next,
          )
          return viewport ? { ...current, viewport } : current
        })
      })
    },
    [input.updateWorkspace],
  )
  const onPrepared = useCallback(() => {
    const next = pending.current
    pending.current = null
    if (next) focus(next)
  }, [focus])
  const navigate = useCallback(
    (id: EvidenceAnchorId): void => {
      const request = ++generation.current
      void input.client
        .getEvidenceNavigation(id)
        .then((next) => {
          if (request !== generation.current) return
          if (!next || !input.workspace) throw new Error(t("evidence.notFound"))
          const document = evidenceDocument(next, input.workspace.documents, locale)
          setTarget(next)
          const ready = input.readerVisible && input.workspace.activeDocumentId === document.id
          pending.current = ready ? null : next
          input.updateWorkspace((current) =>
            current ? { ...current, activeDocumentId: document.id } : current,
          )
          input.setPage(next.page)
          input.openReader()
          if (ready) focus(next)
        })
        .catch((error: unknown) => {
          if (request === generation.current)
            input.onError(error instanceof Error ? error.message : t("evidence.openFailed"))
        })
    },
    [input, focus, locale, t],
  )
  const dismiss = useCallback(() => {
    generation.current += 1
    cancelAnimationFrame(frame.current)
    pending.current = null
    setTarget(null)
  }, [])
  return { target, dismiss, navigate, onPrepared, registerPageJump, jump }
}
