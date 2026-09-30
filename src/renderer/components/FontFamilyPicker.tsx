import type { CSSProperties, JSX } from "react"
import type { UiFontFamily } from "../../shared/schemas"
import { uiFontFamilyStack, uiFontOptions } from "../../shared/uiAppearance"

const koreanSample = "어텐션은 모든 토큰이 한 번에 다른 모든 토큰을 보게 합니다."
const latinSample = "Attention lets every token look at every other token in a single step."

export function FontFamilyPicker({
  value,
  onChange,
}: {
  readonly value: UiFontFamily
  readonly onChange: (font: UiFontFamily) => void
}): JSX.Element {
  return (
    <fieldset className="settings-font-picker">
      <legend>글꼴</legend>
      {uiFontOptions.map((option) => {
        const style: CSSProperties = { fontFamily: uiFontFamilyStack(option.value) }
        return (
          <button
            key={option.value}
            type="button"
            className="settings-font-option"
            aria-pressed={value === option.value}
            style={style}
            onClick={() => onChange(option.value)}
          >
            <span className="settings-font-option-label">{option.label}</span>
            <span className="settings-font-option-sample">
              <span>{koreanSample}</span>
              <span>{latinSample}</span>
            </span>
          </button>
        )
      })}
    </fieldset>
  )
}
