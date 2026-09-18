import { type ComponentProps, type JSX, useEffect, useRef, useState } from "react"
import type { DocumentId } from "../types"
import { LibraryHome } from "./LibraryHome"

export function LibraryWorkspace(props: ComponentProps<typeof LibraryHome>): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const requestGeneration = useRef(0)
  const active = useRef(props.active)
  active.current = props.active
  useEffect(() => {
    if (props.active === false) requestGeneration.current += 1
  }, [props.active])
  async function openExternal(url: string): Promise<void> {
    setError(null)
    try {
      await window.scourgify.openExternal({ url })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "논문 링크를 열지 못했습니다.")
    }
  }
  async function openDocumentKnowledge(id: DocumentId): Promise<void> {
    const document = props.documents.find((candidate) => candidate.id === id)
    if (!document || !props.clientOps || !props.onOpenNode) return
    const generation = ++requestGeneration.current
    setError(null)
    try {
      const versions = await props.clientOps.getDocVersionsByHash(document.hash)
      if (requestGeneration.current !== generation || active.current === false) return
      const version =
        versions.find((candidate) => candidate.originalDocumentId === id) ?? versions[0]
      if (!version) {
        setError("이 문서의 지식 연결을 아직 찾지 못했습니다. 잠시 후 다시 시도해 주세요.")
        return
      }
      props.onOpenNode(version.paperNodeId)
    } catch (cause) {
      if (requestGeneration.current !== generation || active.current === false) return
      setError(cause instanceof Error ? cause.message : "논문 정보를 열지 못했습니다.")
    }
  }
  return (
    <>
      <LibraryHome
        {...props}
        onOpenKnowledge={(id) => void openDocumentKnowledge(id)}
        onOpenExternal={(url) => void openExternal(url)}
      />
      {error ? (
        <div className="library-action-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            닫기
          </button>
        </div>
      ) : null}
    </>
  )
}
