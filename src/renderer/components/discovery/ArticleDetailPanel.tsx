import { BookmarkPlus, ExternalLink, GitBranch, Search, X } from "lucide-react"
import { type JSX, useEffect, useState } from "react"
import type { DiscoveryApi, DiscoverySaveResult } from "../../../shared/discoveryIpc"
import type { KnowledgeNodeId } from "../../../shared/knowledgeSchemas"
import type { ScholarlySearchItem } from "../../../shared/scholarlySearchSchemas"

type SaveState =
  | { readonly status: "idle" | "saving" }
  | { readonly status: "done"; readonly result: DiscoverySaveResult }
  | { readonly status: "error"; readonly message: string }

export interface ArticleDetailPanelProps {
  readonly item: ScholarlySearchItem
  readonly saveMetadata: DiscoveryApi["saveMetadata"]
  readonly savedResult?: DiscoverySaveResult
  readonly onSaved: (result: DiscoverySaveResult) => void
  readonly onSearchByTitle: (item: ScholarlySearchItem) => void
  readonly onOpenExternal?: ((url: string) => void) | undefined
  readonly onOpenNode?: ((id: KnowledgeNodeId) => void) | undefined
  readonly onOpenGraph?: (() => void) | undefined
  readonly onClose: () => void
}

function identifier(item: ScholarlySearchItem): string {
  return (
    item.identity.doi ??
    item.identity.arxivId ??
    item.identity.openAlexId ??
    item.identity.providerRecordId
  )
}

export function ArticleDetailPanel({
  item,
  saveMetadata,
  savedResult,
  onSaved,
  onSearchByTitle,
  onOpenExternal,
  onOpenNode,
  onOpenGraph,
  onClose,
}: ArticleDetailPanelProps): JSX.Element {
  const [save, setSave] = useState<SaveState>(
    savedResult ? { status: "done", result: savedResult } : { status: "idle" },
  )

  useEffect(() => {
    setSave(savedResult ? { status: "done", result: savedResult } : { status: "idle" })
  }, [savedResult])

  async function saveToLibrary(): Promise<void> {
    setSave({ status: "saving" })
    try {
      const result = await saveMetadata({ item })
      setSave({ status: "done", result })
      onSaved(result)
    } catch (cause) {
      setSave({
        status: "error",
        message: cause instanceof Error ? cause.message : "메타데이터를 저장하지 못했습니다.",
      })
    }
  }

  const sourceUrl = item.access.fullText.url ?? item.landingUrl
  const savedNodeId = save.status === "done" ? save.result.node.id : undefined

  return (
    <aside className="discovery-detail" aria-label="선택한 논문 상세">
      <header className="discovery-detail-header">
        <div>
          <p className="discovery-detail-kicker">선택한 논문</p>
          <span className="discovery-provider">{item.provider}</span>
        </div>
        <button
          className="discovery-icon-button"
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <div className="discovery-detail-body">
        <h2>{item.title}</h2>
        <p className="discovery-byline">
          {[item.authors.slice(0, 5).join(", "), item.year, item.venue].filter(Boolean).join(" · ")}
        </p>
        <dl className="discovery-detail-metadata">
          <div>
            <dt>식별자</dt>
            <dd>{identifier(item)}</dd>
          </div>
          <div>
            <dt>피인용 수</dt>
            <dd>{item.citationCount === null ? "확인되지 않음" : `${item.citationCount}회`}</dd>
          </div>
        </dl>
        <div className="discovery-detail-actions">
          {sourceUrl && onOpenExternal ? (
            <button
              className="discovery-button discovery-button-primary"
              type="button"
              onClick={() => onOpenExternal(sourceUrl)}
            >
              <ExternalLink aria-hidden="true" size={15} /> 원문 열기
            </button>
          ) : null}
          <button
            className="discovery-button"
            type="button"
            disabled={save.status === "saving" || save.status === "done"}
            onClick={() => void saveToLibrary()}
          >
            <BookmarkPlus aria-hidden="true" size={15} />
            {save.status === "done" ? "저장됨" : "라이브러리에 저장"}
          </button>
        </div>
        {save.status === "done" ? (
          <div className="discovery-detail-saved" role="status">
            <span>
              {save.result.status === "duplicate"
                ? "기존 지식 항목을 찾았습니다."
                : "지식 라이브러리에 저장했습니다."}
            </span>
            {savedNodeId && onOpenNode ? (
              <button
                className="discovery-link"
                type="button"
                onClick={() => onOpenNode(savedNodeId)}
              >
                지식·노트 열기
              </button>
            ) : null}
          </div>
        ) : null}
        {save.status === "error" ? (
          <p className="discovery-error" role="alert">
            {save.message}
          </p>
        ) : null}
        <section className="discovery-detail-section" aria-labelledby="discovery-abstract-title">
          <h3 id="discovery-abstract-title">초록</h3>
          <p>{item.abstract ?? "이 제공자는 초록을 제공하지 않았습니다."}</p>
        </section>
        <section className="discovery-detail-section" aria-labelledby="discovery-explore-title">
          <div className="discovery-section-heading">
            <h3 id="discovery-explore-title">탐색</h3>
            <span className="discovery-detail-kicker">현재 논문을 기준으로</span>
          </div>
          <button className="discovery-button" type="button" onClick={() => onSearchByTitle(item)}>
            <Search aria-hidden="true" size={15} /> 이 제목으로 더 검색
          </button>
          {onOpenGraph ? (
            <button className="discovery-button" type="button" onClick={onOpenGraph}>
              <GitBranch aria-hidden="true" size={15} /> 논문 그래프에서 탐색
            </button>
          ) : null}
          <p className="discovery-detail-note">
            제공자의 제목·주제 검색을 다시 실행합니다. 실제 유사도 점수나 관계를 추정하지 않습니다.
          </p>
        </section>
        <section className="discovery-detail-section" aria-labelledby="discovery-relations-title">
          <div className="discovery-section-heading">
            <h3 id="discovery-relations-title">관계</h3>
            <span className="discovery-detail-kicker">지원 상태</span>
          </div>
          {onOpenGraph ? (
            <div className="discovery-relation-row">
              <span>참고문헌 · 피인용 · 관련 논문</span>
              <button className="discovery-relation-button" type="button" onClick={onOpenGraph}>
                그래프 열기
              </button>
            </div>
          ) : (
            <>
              <div className="discovery-relation-row">
                <span>참고문헌 목록</span>
                <button
                  className="discovery-relation-button"
                  type="button"
                  disabled
                  aria-label="참고문헌 목록"
                >
                  목록 미지원
                </button>
              </div>
              <div className="discovery-relation-row">
                <span>피인용 논문 목록</span>
                <button
                  className="discovery-relation-button"
                  type="button"
                  disabled
                  aria-label="피인용 논문 목록"
                >
                  목록 미지원
                </button>
              </div>
              <p className="discovery-detail-note">
                이 논문을 저장한 뒤 그래프 API를 연결하면 관계를 불러올 수 있습니다.
              </p>
            </>
          )}
        </section>
      </div>
    </aside>
  )
}
