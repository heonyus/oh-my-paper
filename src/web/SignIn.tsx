import { ArrowDown, LogIn } from "lucide-react"
import type { JSX } from "react"
import leafMarkUrl from "../../assets/branding/scourgify-leaf-mark.png"
import sceneUrl from "../../assets/branding/scourgify-onboarding-golden-leaves-v1.jpg"
import { authClient } from "./authClient"
import { OnboardingStory } from "./OnboardingStory"

export function SignIn({ checking = false }: { readonly checking?: boolean }): JSX.Element {
  const start = (): void => {
    void authClient.signIn.social({ provider: "google", callbackURL: "/" })
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-hero" aria-labelledby="onboarding-title">
        <div className="onboarding-scene-shift" aria-hidden="true">
          <img
            className="onboarding-scene-image"
            src={sceneUrl}
            alt=""
            width="1672"
            height="941"
            fetchPriority="high"
            decoding="async"
          />
          <div className="onboarding-scene-light" />
          <div className="onboarding-scene-mist" />
        </div>
        <div className="onboarding-entry">
          <div className="onboarding-copy">
            <div className="onboarding-brand">
              <span className="onboarding-brand-mark">
                <img src={leafMarkUrl} alt="Scourgify" width="1024" height="1024" />
              </span>
              <div>
                <p className="onboarding-category">학술 PDF 리더</p>
                <h1 id="onboarding-title">Scourgify</h1>
              </div>
            </div>
            <p className="onboarding-description">번역·메모·인용을 원문 위치와 함께 정리합니다.</p>
          </div>
          <div className="onboarding-action">
            <button
              type="button"
              className="onboarding-primary-action"
              disabled={checking}
              onClick={start}
            >
              <LogIn size={16} /> {checking ? "계정 확인 중" : "Google로 계속"}
            </button>
            <p>PDF 업로드와 AI 처리는 직접 실행할 때만 시작됩니다.</p>
          </div>
        </div>
        <a className="onboarding-scroll-cue" href="#onboarding-story">
          기능 살펴보기 <ArrowDown size={14} />
        </a>
      </section>
      <OnboardingStory checking={checking} onStart={start} />
    </main>
  )
}
