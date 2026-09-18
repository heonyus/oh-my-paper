import { useEffect, useState } from "react"
import type { DocumentAnalysisSnapshot } from "../../shared/documentAnalysis"

export function useDocumentAnalysisQueue(): DocumentAnalysisSnapshot {
  const [jobs, setJobs] = useState<DocumentAnalysisSnapshot>([])

  useEffect(() => {
    let cancelled = false
    let eventReceived = false
    const unsubscribe = window.scourgify.onDocumentAnalysis((snapshot) => {
      if (cancelled) return
      eventReceived = true
      setJobs(snapshot)
    })
    void window.scourgify
      .readDocumentAnalysis()
      .then((snapshot) => {
        if (!cancelled && !eventReceived) setJobs(snapshot)
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error
      })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return jobs
}
