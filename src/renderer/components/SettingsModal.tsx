import { BookOpen, Bot, SlidersHorizontal, X } from "lucide-react"
import { type JSX, useLayoutEffect, useRef, useState } from "react"
import type { DocumentOcrProviderStatus } from "../../shared/documentOcr"
import type { ProviderConfig, ProviderStatus } from "../../shared/ipc"
import type { AiMode } from "../../shared/providerModels"
import type { AppearanceTheme } from "../../shared/schemas"
import { uiFontScaleLabel, uiFontScalePercent, uiFontScalePresets } from "../../shared/uiAppearance"
import { AiProviderSettings, useAiProviderForm } from "./AiProviderSettings"
import { CodexSettings } from "./CodexSettings"
import { DocumentOcrSettings } from "./DocumentOcrSettings"
import {
  HostedCredentialSettings,
  type HostedCredentialSettingsProps,
} from "./HostedCredentialSettings"
import { LocalAiPanel } from "./localAi/LocalAiPanel"
import "./settings-dialog.css"

type SettingsSection = "general" | "ai" | "reading"

type SettingsModalProps = {
  readonly status: ProviderStatus
  readonly fontScale: number
  readonly minimapVisible?: boolean | undefined
  readonly onClose: () => void
  readonly onSave: (config: ProviderConfig) => Promise<void>
  readonly onModeSave?: (mode: AiMode) => Promise<void>
  readonly ocrStatus?: DocumentOcrProviderStatus | undefined
  readonly onFontScaleChange: (scale: number) => void
  readonly onMinimapVisibleChange?: ((visible: boolean) => void) | undefined
  readonly theme?: AppearanceTheme | undefined
  readonly onThemeChange?: ((theme: AppearanceTheme) => void) | undefined
  readonly appearanceOnly?: boolean | undefined
  readonly hostedCredentials?: HostedCredentialSettingsProps | undefined
  readonly openRouterRequired?: boolean | undefined
  readonly locked?: boolean | undefined
}

const sections = [
  { id: "general", label: "일반", icon: SlidersHorizontal },
  { id: "ai", label: "AI 모델", icon: Bot },
  { id: "reading", label: "읽기", icon: BookOpen },
] as const

export function SettingsModal({
  status,
  fontScale,
  minimapVisible = true,
  onClose,
  onSave,
  onModeSave,
  onFontScaleChange,
  onMinimapVisibleChange,
  theme = "system",
  onThemeChange,
  appearanceOnly = false,
  hostedCredentials,
  ocrStatus,
  openRouterRequired = false,
  locked = false,
}: SettingsModalProps): JSX.Element {
  const [section, setSection] = useState<SettingsSection>(appearanceOnly ? "general" : "ai")
  const visibleSections = locked
    ? sections.filter((candidate) => candidate.id === "ai")
    : appearanceOnly
      ? sections.filter((candidate) => candidate.id !== "ai")
      : sections
  const hideChatgptMode = locked && status.mode === undefined
  const aiProviderForm = useAiProviderForm(status, openRouterRequired, hideChatgptMode)
  const credentialsReady = status.configured
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="modal-backdrop settings-backdrop"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!locked) onClose()
      }}
    >
      <section className="settings-modal">
        <aside className="settings-source-list" aria-label="설정 섹션">
          <h2 id="settings-title">설정</h2>
          <nav>
            {visibleSections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className="settings-nav-item"
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="settings-content">
          <header className="settings-content-head">
            <div>
              <h3>{visibleSections.find((item) => item.id === section)?.label}</h3>
              {section === "ai" ? (
                <span className="settings-connection" data-ready={credentialsReady}>
                  <i /> {credentialsReady ? "연결 준비됨" : "AI 연결 설정 필요"}
                </span>
              ) : null}
            </div>
            {!locked ? (
              <button
                type="button"
                className="settings-close"
                aria-label="설정 닫기"
                onClick={onClose}
              >
                <X size={17} />
              </button>
            ) : null}
          </header>
          <div className="settings-page">
            {section === "general" ? (
              <fieldset className="settings-group">
                <legend>일반 환경설정</legend>
                <label className="settings-row" htmlFor="appearance-theme">
                  <span>화면 모드</span>
                  <select
                    id="appearance-theme"
                    value={theme}
                    onChange={(event) => {
                      const next = event.currentTarget.value
                      if (next === "system" || next === "light" || next === "dark")
                        onThemeChange?.(next)
                    }}
                  >
                    <option value="system">시스템 설정</option>
                    <option value="light">라이트</option>
                    <option value="dark">다크</option>
                  </select>
                </label>
                <label className="settings-row" htmlFor="ui-font-scale">
                  <span>
                    <strong>글자 크기</strong>
                    <small>{uiFontScaleLabel(fontScale)}</small>
                  </span>
                  <span className="settings-range-control">
                    <input
                      id="ui-font-scale"
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={fontScale}
                      onChange={(event) => onFontScaleChange(Number(event.currentTarget.value))}
                    />
                    <output htmlFor="ui-font-scale">{uiFontScalePercent(fontScale)}%</output>
                  </span>
                </label>
                <fieldset className="settings-scale-presets">
                  <legend>글자 크기 빠른 선택</legend>
                  {uiFontScalePresets.map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      aria-pressed={fontScale === scale}
                      onClick={() => onFontScaleChange(scale)}
                    >
                      {uiFontScalePercent(scale)}%
                    </button>
                  ))}
                </fieldset>
              </fieldset>
            ) : null}
            {section === "ai" ? (
              <div className="settings-ai-stack">
                {hostedCredentials ? (
                  <HostedCredentialSettings {...hostedCredentials} />
                ) : (
                  <>
                    <AiProviderSettings
                      form={aiProviderForm}
                      onSave={onSave}
                      onModeSave={onModeSave ?? (async () => {})}
                      openRouterOnly={openRouterRequired}
                      hideChatgptMode={hideChatgptMode}
                    />
                    {!hideChatgptMode && aiProviderForm.mode === "chatgpt" ? (
                      <CodexSettings
                        onConnectionChange={async () => {
                          await onModeSave?.("chatgpt")
                        }}
                      />
                    ) : null}
                  </>
                )}
                {ocrStatus && !locked ? <DocumentOcrSettings status={ocrStatus} /> : null}
                {!openRouterRequired && window.ohmypaper?.localInference ? (
                  <LocalAiPanel
                    api={window.ohmypaper.localInference}
                    nodeTitle="로컬 제안 설정"
                    draft=""
                    imeComposing={false}
                    showSuggestions={false}
                    runSuggestions={false}
                  />
                ) : null}
              </div>
            ) : null}
            {section === "reading" ? (
              <fieldset className="settings-group">
                <legend>읽기 환경설정</legend>
                <label className="settings-row settings-toggle-row">
                  <span>
                    <strong>미니맵 표시</strong>
                    <small>긴 논문과 카드 위치를 한눈에 봅니다.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="settings-switch"
                    aria-label="미니맵 표시"
                    checked={minimapVisible}
                    onChange={(event) => onMinimapVisibleChange?.(event.currentTarget.checked)}
                  />
                </label>
              </fieldset>
            ) : null}
          </div>
        </div>
      </section>
    </dialog>
  )
}
