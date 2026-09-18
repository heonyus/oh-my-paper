import { BookmarkPlus, ExternalLink } from "lucide-react"
import { type JSX, useState } from "react"
import type { DiscoveryApi, DiscoverySaveResult } from "../../../shared/discoveryIpc"
import type { ScholarlySearchItem } from "../../../shared/scholarlySearchSchemas"

export interface SearchResultCardProps {
  readonly item: ScholarlySearchItem
  readonly selected?: boolean
  readonly saveMetadata: DiscoveryApi["saveMetadata"]
  readonly onSaved?: (result: DiscoverySaveResult) => void
  readonly onSelect?: () => void
  readonly onOpenExternal?: ((url: string) => void) | undefined
}

type SaveState =
  | { readonly status: "idle" | "saving" }
  | { readonly status: "done"; readonly result: DiscoverySaveResult }
  | { readonly status: "error"; readonly message: string }

function identifier(item: ScholarlySearchItem): string {
  return (
    item.identity.doi ??
    item.identity.arxivId ??
    item.identity.openAlexId ??
    item.identity.providerRecordId
  )
}

export function SearchResultCard({
  item,
  selected = false,
  saveMetadata,
  onOpenExternal,
  onSaved,
  onSelect,
}: SearchResultCardProps): JSX.Element {
  const [save, setSave] = useState<SaveState>({ status: "idle" })

  async function saveToLibrary(): Promise<void> {
    setSave({ status: "saving" })
    try {
      const result = await saveMetadata({ item })
      setSave({ status: "done", result })
      onSaved?.(result)
    } catch (cause) {
      setSave({
        status: "error",
        message: cause instanceof Error ? cause.message : "메타데이터를 저장하지 못했습니다.",
      })
    }
  }

  return (
    <article className="discovery-result" aria-current={selected ? "true" : undefined}>
      <div className="discovery-result-heading">
        <div>
          <span className="discovery-provider">{item.provider}</span>
          <h2>{item.title}</h2>
        </div>
        <button
          className="discovery-button"
          type="button"
          onClick={() => void saveToLibrary()}
          disabled={save.status === "saving" || save.status === "done"}
        >
          <BookmarkPlus aria-hidden="true" size={16} />
          {save.status === "done" ? "저장됨" : "라이브러리에 저장"}
        </button>
      </div>
      <p className="discovery-byline">
        {[item.authors.slice(0, 4).join(", "), item.year, item.venue].filter(Boolean).join(" · ")}
      </p>
      <p className="discovery-identity">{identifier(item)}</p>
      {item.abstract ? <p className="discovery-abstract">{item.abstract}</p> : null}
      <div className="discovery-result-footer">
        <span>
          초록 {item.access.abstract === "available" ? "있음" : "없음"} · 원문{" "}
          {item.access.fullText.state === "open" ? "공개 링크" : "미확인"}
        </span>
        {item.landingUrl && onOpenExternal ? (
          <button
            className="discovery-link"
            type="button"
            onClick={() => onOpenExternal(item.landingUrl ?? "")}
          >
            제공자 페이지 <ExternalLink aria-hidden="true" size={14} />
          </button>
        ) : null}
        {onSelect ? (
          <button className="discovery-link discovery-select" type="button" onClick={onSelect}>
            상세 보기
          </button>
        ) : null}
      </div>
      {save.status === "done" ? (
        <p className="discovery-save-status" role="status">
          {save.result.status === "duplicate"
            ? "같은 식별자의 기존 논문을 사용했습니다."
            : "메타데이터를 지식 라이브러리에 저장했습니다."}
        </p>
      ) : null}
      {save.status === "error" ? (
        <p className="discovery-error" role="alert">
          {save.message}
        </p>
      ) : null}
    </article>
  )
}
