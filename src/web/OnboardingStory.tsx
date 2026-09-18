import { LogIn } from "lucide-react"
import type { JSX } from "react"

export function OnboardingStory({
  checking,
  onStart,
}: {
  readonly checking: boolean
  readonly onStart: () => void
}): JSX.Element {
  return (
    <div id="onboarding-story" className="onboarding-story">
      <section className="onboarding-chapter onboarding-chapter-paper">
        <div className="onboarding-story-copy">
          <span>01 · 읽기</span>
          <h2>PDF의 페이지 구성을 유지합니다.</h2>
          <p>본문, 수식, 표, 그림을 원래 페이지와 함께 확인합니다.</p>
        </div>
        <div className="onboarding-demo onboarding-demo-reader" aria-hidden="true">
          <div className="demo-reader-toolbar">
            <i />
            <span>p. 14 / 32</span>
          </div>
          <div className="demo-paper">
            <small>METHODS</small>
            <strong>Evidence remains close to the source.</strong>
            <div className="demo-paper-columns">
              <div>
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="demo-paper-figure">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="onboarding-chapter onboarding-chapter-translation">
        <div className="onboarding-story-copy">
          <span>02 · 번역</span>
          <h2>현재 페이지를 문단 단위로 번역합니다.</h2>
          <p>필요한 순간에만 번역하고, 결과는 원문 오른쪽에 맞춰 표시합니다.</p>
        </div>
        <div className="onboarding-demo onboarding-demo-translation" aria-hidden="true">
          <article>
            <small>ORIGINAL · p. 4</small>
            <p>We connect each finding to the passage where it began.</p>
            <mark>source passage</mark>
          </article>
          <i className="demo-translation-link" />
          <article>
            <small>TRANSLATION</small>
            <p>각 결과를 시작된 원문 구절과 연결합니다.</p>
          </article>
        </div>
      </section>

      <section className="onboarding-chapter onboarding-chapter-notes">
        <div className="onboarding-story-copy">
          <span>03 · 기록</span>
          <h2>메모와 인용에 출처 위치를 남깁니다.</h2>
          <p>카드를 다시 열면 시작한 페이지와 문장으로 바로 돌아갑니다.</p>
        </div>
        <div className="onboarding-demo onboarding-demo-notes" aria-hidden="true">
          <article className="demo-source-card">
            <small>Figure 2 · p. 14</small>
            <p>Source evidence and interpretation stay visibly connected.</p>
          </article>
          <i className="demo-note-connector" />
          <article className="demo-note-card">
            <small>메모</small>
            <p>이 결과를 실험 설정과 함께 다시 확인하기.</p>
            <span>원문 위치 보기</span>
          </article>
          <div className="demo-citation">[14] Related work · p. 21</div>
        </div>
      </section>

      <section className="onboarding-final">
        <div className="onboarding-final-copy">
          <span>oh-my-paper</span>
          <h2>로그인하면 라이브러리에서 PDF를 추가할 수 있습니다.</h2>
          <p>업로드와 AI 처리는 직접 실행하기 전에는 시작되지 않습니다.</p>
          <button
            type="button"
            className="onboarding-primary-action"
            disabled={checking}
            onClick={onStart}
          >
            <LogIn size={17} /> {checking ? "계정 확인 중" : "Google로 계속"}
          </button>
        </div>
      </section>
    </div>
  )
}
