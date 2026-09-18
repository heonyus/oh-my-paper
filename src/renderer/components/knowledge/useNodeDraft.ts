import { useEffect, useRef, useState } from "react"
import type { KnowledgeNode, KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import { registerNoteDraftRecovery } from "../../lib/noteDraftRecovery"

export type NoteDraftUpdate = {
  readonly expectedBody?: string
  readonly title?: string
  readonly body?: string
  readonly aliases?: readonly string[]
}

export function useNodeDraft(
  node: KnowledgeNode | null,
  update: (input: NoteDraftUpdate) => Promise<KnowledgeNode>,
  onEditing: (editing: boolean) => void,
) {
  const [editingId, setEditingId] = useState<KnowledgeNodeId | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [baseBody, setBaseBody] = useState("")
  const [baseTitle, setBaseTitle] = useState("")
  const [baseAliases, setBaseAliases] = useState("")
  const [aliases, setAliases] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveInFlightRef = useRef(false)
  const sessionRef = useRef(0)
  const editingIdRef = useRef<KnowledgeNodeId | null>(null)
  const nodeSnapshotRef = useRef<string | null>(null)
  const titleRef = useRef(title)
  const bodyRef = useRef(body)
  const aliasesRef = useRef(aliases)
  titleRef.current = title
  bodyRef.current = body
  aliasesRef.current = aliases
  editingIdRef.current = editingId
  const dirty = body !== baseBody || title !== baseTitle || aliases !== baseAliases
  const nodeSnapshot = node ? JSON.stringify([node.id, node.title, node.body, node.aliases]) : null
  useEffect(() => {
    onEditing(editingId !== null && (dirty || saving))
  }, [dirty, editingId, onEditing, saving])
  useEffect(() => {
    if (
      node?.kind !== "note" ||
      editingIdRef.current !== node.id ||
      nodeSnapshotRef.current === nodeSnapshot
    )
      return
    nodeSnapshotRef.current = nodeSnapshot
    if (dirty || saving || saveInFlightRef.current) return
    const nextAliases = node.aliases.join(", ")
    setTitle(node.title)
    setBody(node.body)
    setBaseBody(node.body)
    setBaseTitle(node.title)
    setBaseAliases(nextAliases)
    setAliases(nextAliases)
  }, [dirty, node, nodeSnapshot, saving])
  useEffect(() => {
    const account = window.scourgify?.account
    if (!editingId || !account) return
    if (body === baseBody && title === baseTitle && aliases === baseAliases) return
    let persisted = false
    async function recover(): Promise<void> {
      if (!editingId || !account || persisted) return
      await account.saveRecoveryDraft({
        nodeId: editingId,
        title: title.trim() || node?.title || "제목 없음",
        body,
        expectedBody: baseBody,
        aliases: aliases
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        capturedAt: new Date().toISOString(),
      })
      persisted = true
    }
    const unregister = registerNoteDraftRecovery(recover)
    const unsubscribe = account.onStatusChanged((status) => {
      if (status.state === "locked")
        void recover().catch(() => {
          setError("복구 사본을 저장하지 못했습니다. 이 창을 닫지 말고 다시 로그인해 저장하세요.")
        })
    })
    return () => {
      unregister()
      unsubscribe()
    }
  }, [editingId, title, body, baseBody, baseTitle, baseAliases, aliases, node?.title])
  function start(): void {
    if (!node) return
    setTitle(node.title)
    setBody(node.body)
    setBaseBody(node.body)
    setBaseTitle(node.title)
    setBaseAliases(node.aliases.join(", "))
    setAliases(node.aliases.join(", "))
    setEditingId(node.id)
    editingIdRef.current = node.id
    sessionRef.current += 1
    saveInFlightRef.current = false
    setSaving(false)
    setError(null)
  }
  function cancel(): void {
    sessionRef.current += 1
    saveInFlightRef.current = false
    setSaving(false)
    setEditingId(null)
    editingIdRef.current = null
    setError(null)
  }
  function reset(): void {
    if (!node || editingIdRef.current !== node.id || saveInFlightRef.current) return
    setTitle(node.title)
    setBody(node.body)
    setAliases(node.aliases.join(", "))
    setBaseBody(node.body)
    setBaseTitle(node.title)
    setBaseAliases(node.aliases.join(", "))
    setError(null)
  }
  async function save(stayEditing = false): Promise<void> {
    if (!node || editingIdRef.current !== node.id || saveInFlightRef.current) return
    const session = sessionRef.current
    const rawTitle = title
    const rawAliases = aliases
    const capturedTitle = title.trim() || node.title
    const capturedBody = body
    const capturedAliases = aliases
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    const capturedBaseBody = baseBody
    saveInFlightRef.current = true
    setSaving(true)
    setError(null)
    try {
      const saved = await update({
        title: capturedTitle,
        body: capturedBody,
        expectedBody: capturedBaseBody,
        aliases: capturedAliases,
      })
      if (session !== sessionRef.current || editingIdRef.current !== node.id) return
      if (titleRef.current === rawTitle && saved.title !== rawTitle) setTitle(saved.title)
      if (bodyRef.current === capturedBody && saved.body !== capturedBody) setBody(saved.body)
      if (aliasesRef.current === rawAliases && saved.aliases.join(", ") !== rawAliases)
        setAliases(saved.aliases.join(", "))
      setBaseBody(saved.body)
      setBaseTitle(saved.title)
      setBaseAliases(saved.aliases.join(", "))
      if (!stayEditing) cancel()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다.")
    } finally {
      saveInFlightRef.current = false
      if (session === sessionRef.current) setSaving(false)
    }
  }
  function markSaved(value: string): void {
    setBody(value)
    setBaseBody(value)
  }
  return {
    editing: editingId !== null,
    title,
    setTitle,
    body,
    setBody,
    baseBody,
    aliases,
    setAliases,
    saving,
    dirty,
    error,
    setError,
    start,
    cancel,
    reset,
    save,
    markSaved,
  }
}
