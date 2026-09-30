// @vitest-environment node
import { describe, expect, it } from "vitest"
import { detectCliLocale } from "../../src/cli/locale"
import { cliMessages } from "../../src/cli/messages"
import { settingsMessages } from "../../src/renderer/messages/settings"
import { formatOcrInstallProgress } from "../../src/shared/documentOcr"
import {
  type Catalog,
  formatMessage,
  LOCALES,
  localeFromTags,
  translator,
} from "../../src/shared/i18n/locale"
import { webMessages } from "../../src/web/messages"

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort()

/** Every language has every key, none empty, with the same placeholders as the source. */
function expectComplete(catalog: Catalog<Readonly<Record<string, string>>>): void {
  const source = catalog.ko
  for (const locale of LOCALES) {
    const messages = catalog[locale]
    expect(Object.keys(messages).sort()).toEqual(Object.keys(source).sort())
    for (const [key, text] of Object.entries(messages)) {
      expect(text.trim(), `${locale} ${key}`).not.toBe("")
      expect(placeholders(text), `${locale} ${key}`).toEqual(placeholders(source[key] ?? ""))
    }
  }
}

describe("locale", () => {
  it("reads browser and terminal tags, skipping ones without a language", () => {
    expect(localeFromTags(["ko-KR"])).toBe("ko")
    expect(localeFromTags(["en_US.UTF-8"])).toBe("en")
    expect(localeFromTags([undefined, "", "C", "C.UTF-8", "POSIX", "ko_KR.UTF-8"])).toBe("ko")
    expect(localeFromTags(["", "C"])).toBeNull()
  })

  it("falls back to English for a language the app does not speak", () => {
    expect(localeFromTags(["ja-JP", "ko-KR"])).toBe("en")
  })

  it("lets OH_MY_PAPER_LANG override the terminal, and asks the system only without one", () => {
    const system = () => ["ko-KR"]
    expect(detectCliLocale({ OH_MY_PAPER_LANG: "en", LANG: "ko_KR.UTF-8" }, system)).toBe("en")
    expect(detectCliLocale({ LANG: "en_US.UTF-8" }, system)).toBe("en")
    expect(detectCliLocale({ LANG: "C" }, system)).toBe("ko")
    expect(detectCliLocale({}, () => [])).toBe("en")
  })

  it("fills placeholders and leaves unknown ones", () => {
    expect(formatMessage("{a} and {b}", { a: 1 })).toBe("1 and {b}")
  })
})

describe("CLI wording", () => {
  it("has every message in both languages with matching placeholders", () => {
    expectComplete(cliMessages)
    expectComplete(webMessages)
    expectComplete(settingsMessages)
  })

  it("speaks English when asked", () => {
    const t = translator(cliMessages, "en")
    expect(t("progress.commits", { from: "abc1234", to: "def5678", count: 3 })).toBe(
      "abc1234 → def5678 · 3 commits",
    )
    expect(formatOcrInstallProgress({ percent: 42, etaSeconds: 120 }, "en")).toBe(
      "42% · about 2 min left",
    )
  })
})
