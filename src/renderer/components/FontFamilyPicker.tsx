import type { CSSProperties, JSX } from "react"
import type { UiFontFamily } from "../../shared/schemas"
import { uiFontFamilyStack, uiFontOptions } from "../../shared/uiAppearance"

const koreanSample = "읽은 것은 남고, 필요한 것은 다시 찾을 수 있어야 합니다."
const latinSample = "What we read should remain, and what we need should be easy to find again."

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
