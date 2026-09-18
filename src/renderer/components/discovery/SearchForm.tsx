import { Search, X } from "lucide-react"
import type { FormEvent, JSX } from "react"
import type { ScholarlyProvider } from "../../../shared/scholarlySearchSchemas"
import { scholarlyProviders } from "../../../shared/scholarlySearchSchemas"

export interface SearchFormProps {
  readonly query: string
  readonly fromYear: string
  readonly toYear: string
  readonly providers: readonly ScholarlyProvider[]
  readonly busy: boolean
  readonly historyLength: number
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onQueryChange: (value: string) => void
  readonly onFromYearChange: (value: string) => void
  readonly onToYearChange: (value: string) => void
  readonly onToggleProvider: (provider: ScholarlyProvider) => void
  readonly onBack: () => void
  readonly onCancel: () => void
}

export function SearchForm({
  query,
  fromYear,
  toYear,
  providers,
  busy,
  historyLength,
  onSubmit,
  onQueryChange,
  onFromYearChange,
  onToYearChange,
  onToggleProvider,
  onBack,
  onCancel,
}: SearchFormProps): JSX.Element {
  return (
    <form className="discovery-form" onSubmit={onSubmit}>
      <label className="discovery-query">
        <span>논문, 저자 또는 주제</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          maxLength={500}
        />
      </label>
      <fieldset>
        <legend>제공자</legend>
        <div className="discovery-provider-options">
          {scholarlyProviders.map((provider) => (
            <label key={provider}>
              <input
                type="checkbox"
                checked={providers.includes(provider)}
                onChange={() => onToggleProvider(provider)}
              />
              {provider}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="discovery-years">
        <label>
          시작 연도
          <input
            inputMode="numeric"
            value={fromYear}
            onChange={(event) => onFromYearChange(event.currentTarget.value)}
          />
        </label>
        <label>
          종료 연도
          <input
            inputMode="numeric"
            value={toYear}
            onChange={(event) => onToYearChange(event.currentTarget.value)}
          />
        </label>
      </div>
      <div className="discovery-actions">
        <button
          className="discovery-button"
          type="button"
          onClick={onBack}
          disabled={historyLength === 0}
        >
          이전 검색 {historyLength > 0 ? `(${historyLength}/10)` : ""}
        </button>
        <button className="discovery-button discovery-button-primary" type="submit" disabled={busy}>
          <Search aria-hidden="true" size={16} /> 검색
        </button>
        {busy ? (
          <button className="discovery-button" type="button" onClick={onCancel}>
            <X aria-hidden="true" size={16} /> 취소
          </button>
        ) : null}
      </div>
    </form>
  )
}
