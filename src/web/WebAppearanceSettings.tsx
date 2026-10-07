import { X } from "lucide-react"
import type { CSSProperties, JSX } from "react"
import type { AppearancePreferences } from "../shared/schemas"
import {
  appearanceThemeLabel,
  appearanceThemes,
  isAppearanceTheme,
  uiFontFamilyStack,
  uiFontScaleLabel,
  uiFontScalePercent,
  uiFontScalePresets,
} from "../shared/uiAppearance"

export function WebAppearanceSettings({
  open,
  value,
  onChange,
  onClose,
}: {
  readonly open: boolean
  readonly value: AppearancePreferences
  readonly onChange: (value: AppearancePreferences) => void
  readonly onClose: () => void
}): JSX.Element | null {
  if (!open) return null
  const previewStyle: CSSProperties = {
    fontFamily: uiFontFamilyStack(value.uiFontFamily),
    fontSize: `${14 * value.uiFontScale}px`,
  }
  return (
    <div className="web-settings-backdrop" role="presentation">
      <section
        className="web-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-settings-title"
      >
        <header>
          <h2 id="web-settings-title">화면 설정</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="화면 설정 닫기"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="web-settings-body">
          <label>
            <span>화면 모드</span>
            <select
              value={value.theme}
              onChange={(event) => {
                const theme = event.currentTarget.value
                if (isAppearanceTheme(theme)) onChange({ ...value, theme })
              }}
            >
              {appearanceThemes.map((option) => (
                <option key={option} value={option}>
                  {appearanceThemeLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="web-settings-range">
            <span>
              글자 크기 <small>{uiFontScaleLabel(value.uiFontScale)}</small>
            </span>
            <span>
              <input
                aria-label="글자 크기"
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={value.uiFontScale}
                onChange={(event) =>
                  onChange({ ...value, uiFontScale: Number(event.currentTarget.value) })
                }
              />
              <output>{uiFontScalePercent(value.uiFontScale)}%</output>
            </span>
          </label>
          <fieldset className="web-settings-presets">
            <legend>글자 크기 빠른 선택</legend>
            {uiFontScalePresets.map((scale) => (
              <button
                key={scale}
                type="button"
                aria-pressed={value.uiFontScale === scale}
                onClick={() => onChange({ ...value, uiFontScale: scale })}
              >
                {uiFontScalePercent(scale)}%
              </button>
            ))}
            <button type="button" onClick={() => onChange({ ...value, uiFontScale: 1 })}>
              100%로 초기화
            </button>
          </fieldset>
          <div className="web-settings-preview" style={previewStyle}>
            <p>어텐션은 모든 토큰이 한 번에 다른 모든 토큰을 보게 합니다.</p>
            <p>Attention lets every token look at every other token in a single step.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
