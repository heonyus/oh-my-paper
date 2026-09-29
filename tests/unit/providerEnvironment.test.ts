import { describe, expect, it } from "vitest"
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "../../src/electron/providerEnvironment"

describe("provider defaults", () => {
  it("contains only non-secret model defaults", () => {
    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-6-sol")
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.5-flash-lite")
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-20b")
  })
})
