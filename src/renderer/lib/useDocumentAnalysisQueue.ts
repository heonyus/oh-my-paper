import { useEffect, useState } from "react"
import {
  type DocumentAnalysisSnapshot,
  emptyDocumentAnalysisSnapshot,
} from "../../shared/documentAnalysis"

export function useDocumentAnalysisQueue(): DocumentAnalysisSnapshot {
  const [jobs, setJobs] = useState<DocumentAnalysisSnapshot>(emptyDocumentAnalysisSnapshot)

  useEffect(() => {
    let cancelled = false
    let eventReceived = false
    const unsubscribe = window.ohmypaper.onDocumentAnalysis((snapshot) => {
      if (cancelled) return
      eventReceived = true
      setJobs(snapshot)
    })
    void window.ohmypaper
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
