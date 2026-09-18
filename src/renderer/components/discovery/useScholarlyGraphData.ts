import { useCallback, useEffect, useRef, useState } from "react"
import {
  type ScholarlyGraphApi,
  scholarlyGraphJobIdSchema,
} from "../../../shared/scholarlyGraphIpc"
import type {
  ScholarlyGraphDirection,
  ScholarlyGraphResult,
} from "../../../shared/scholarlyGraphSchemas"
import type { ScholarlySearchItem } from "../../../shared/scholarlySearchSchemas"
import { type GraphHistoryEntry, pushGraphHistory } from "./scholarlyGraphViewModel"

const initialDirections: readonly ScholarlyGraphDirection[] = ["references", "cited_by", "related"]

export function useScholarlyGraphData(
  api: ScholarlyGraphApi,
  seed: ScholarlySearchItem,
  active: boolean,
) {
  const [result, setResult] = useState<ScholarlyGraphResult | null>(null)
  const [selectedId, setSelectedId] = useState(seed.identity.openAlexId ?? seed.identity.doi ?? "")
  const [history, setHistory] = useState<readonly GraphHistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)
  const activeJob = useRef<ReturnType<typeof scholarlyGraphJobIdSchema.parse> | null>(null)
  const generation = useRef(0)
  const historyRef = useRef(history)
  const historyIndexRef = useRef(historyIndex)
  const lastRequest = useRef({ item: seed, directions: initialDirections })

  const cancel = useCallback(() => {
    const job = activeJob.current
    activeJob.current = null
    generation.current += 1
    if (job) void api.cancel({ jobId: job }).catch(() => undefined)
  }, [api])
  useEffect(() => () => cancel(), [cancel])

  const load = useCallback(
    async (
      item: ScholarlySearchItem,
      directions: readonly ScholarlyGraphDirection[],
    ): Promise<void> => {
      const openAlexId = item.identity.openAlexId ?? undefined
      const doi = item.identity.doi ?? undefined
      if (!openAlexId && !doi) {
        setMessage("이 논문에는 OpenAlex ID 또는 DOI가 없어 관계를 불러올 수 없습니다.")
        return
      }
      cancel()
      lastRequest.current = { item, directions }
      const jobId = scholarlyGraphJobIdSchema.parse(crypto.randomUUID())
      activeJob.current = jobId
      const currentGeneration = generation.current
      setStatus("loading")
      setMessage(null)
      try {
        const next = await api.get({
          jobId,
          request: { seed: openAlexId ? { openAlexId } : { doi }, directions, limit: 20 },
        })
        if (activeJob.current !== jobId || currentGeneration !== generation.current) return
        const seedId = next.seedIds[0] ?? item.identity.openAlexId ?? item.identity.doi ?? ""
        const nextHistory = pushGraphHistory(
          historyRef.current.slice(0, historyIndexRef.current + 1),
          {
            seedId,
            selectedId: seedId,
            result: next,
          },
        )
        historyRef.current = nextHistory
        historyIndexRef.current = nextHistory.length - 1
        setHistory(nextHistory)
        setHistoryIndex(nextHistory.length - 1)
        setResult(next)
        setSelectedId(seedId)
        setStatus("idle")
      } catch (cause) {
        if (activeJob.current !== jobId || currentGeneration !== generation.current) return
        setStatus("error")
        setMessage(cause instanceof Error ? cause.message : "논문 관계를 불러오지 못했습니다.")
      } finally {
        if (activeJob.current === jobId) activeJob.current = null
      }
    },
    [api, cancel],
  )

  useEffect(() => {
    if (!active) {
      cancel()
      setStatus("idle")
    } else if (!result) {
      void load(seed, initialDirections)
    }
  }, [active, cancel, load, result, seed])

  const select = (id: string): void => {
    setSelectedId(id)
    const nextHistory = historyRef.current.map((entry, index) =>
      index === historyIndexRef.current ? { ...entry, selectedId: id } : entry,
    )
    historyRef.current = nextHistory
    setHistory(nextHistory)
  }
  const moveHistory = (nextIndex: number): void => {
    const entry = historyRef.current[nextIndex]
    if (!entry) return
    cancel()
    setStatus("idle")
    setMessage(null)
    setSelectedId(entry.selectedId)
    setResult(entry.result)
    historyIndexRef.current = nextIndex
    setHistoryIndex(nextIndex)
  }
  const retry = (): void => {
    void load(lastRequest.current.item, lastRequest.current.directions)
  }
  return {
    result,
    selectedId,
    history,
    historyIndex,
    status,
    message,
    load,
    select,
    moveHistory,
    retry,
  }
}
