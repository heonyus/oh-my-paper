import type { JSX } from "react"
import type { ResearchBudgets } from "../../../shared/researchJobSchemas"

interface ResearchBudgetFieldsProps {
  readonly value: ResearchBudgets
  readonly onChange: (value: ResearchBudgets) => void
}

const fields: readonly (readonly [keyof ResearchBudgets, string, number])[] = [
  ["searchRounds", "검색 횟수", 10],
  ["sources", "자료 수", 50],
  ["minutes", "분", 60],
  ["modelTurns", "모델 턴", 50],
]

export function ResearchBudgetFields(props: ResearchBudgetFieldsProps): JSX.Element {
  return (
    <fieldset className="research-budgets">
      <legend>조사 한도</legend>
      {fields.map(([key, label, maximum]) => (
        <label key={key}>
          <span>{label}</span>
          <input
            type="number"
            min={1}
            max={maximum}
            value={props.value[key]}
            onChange={(event) =>
              props.onChange({ ...props.value, [key]: Number(event.currentTarget.value) })
            }
          />
        </label>
      ))}
    </fieldset>
  )
}
