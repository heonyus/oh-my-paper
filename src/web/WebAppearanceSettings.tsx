import { X } from "lucide-react"
import type { CSSProperties, JSX } from "react"
import type { AppearancePreferences } from "../shared/schemas"
import {
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
                if (theme === "system" || theme === "light" || theme === "dark")
                  onChange({ ...value, theme })
              }}
            >
              <option value="system">시스템 설정</option>
              <option value="light">라이트</option>
              <option value="dark">다크</option>
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
            <p>읽은 것은 남고, 필요한 것은 다시 찾을 수 있어야 합니다.</p>
            <p>What we read should remain, and what we need should be easy to find again.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
