import { describe, expect, it } from "vitest"
import {
  CODEX_DEFAULT_MODEL,
  type CodexModel,
  defaultCodexModel,
} from "../../src/shared/codexTypes"

function model(id: string, isDefault = false): CodexModel {
  return { id, label: id, description: "", isDefault, efforts: [] }
}

describe("defaultCodexModel", () => {
  it("prefers GPT-6 Luna over the runtime's own default when the account lists it", () => {
    expect(CODEX_DEFAULT_MODEL).toBe("gpt-6-luna")
    expect(defaultCodexModel([model("gpt-6.1-sol", true), model("gpt-6-luna")])).toBe("gpt-6-luna")
  })

  it("falls back to the runtime's default when Luna is not offered", () => {
    expect(defaultCodexModel([model("gpt-6-astra"), model("gpt-5.6-sol", true)])).toBe(
      "gpt-5.6-sol",
    )
  })

  it("uses the first model, then the app default, when nothing is marked", () => {
    expect(defaultCodexModel([model("gpt-6-astra"), model("gpt-5.5")])).toBe("gpt-6-astra")
    expect(defaultCodexModel([])).toBe("gpt-6-luna")
  })
})
