import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import type { JSX } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cliLocale, cliTranslator, detectCliLocale, setCliLocale } from "../../src/cli/locale"
import { cliMessages } from "../../src/cli/messages"
import { LocaleProvider, useLocale } from "../../src/renderer/lib/locale"
import { readSavedLanguage, saveLanguage } from "../../src/server/languageStore"

const folders: string[] = []
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true })
})

async function dataDir(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "ohmypaper-language-"))
  folders.push(folder)
  return folder
}

describe("the saved language", () => {
  it("keeps a picked language with the app's data, and forgets it for automatic", async () => {
    const folder = await dataDir()
    expect(readSavedLanguage(folder)).toBeNull()

    await saveLanguage(folder, "en")
    expect(readSavedLanguage(folder)).toBe("en")
    expect(JSON.parse(await readFile(join(folder, "language.json"), "utf8"))).toEqual({
      language: "en",
    })

    await saveLanguage(folder, "auto")
    expect(readSavedLanguage(folder)).toBeNull()
  })

  it("detects the language again when the saved file is damaged", async () => {
    const folder = await dataDir()
    await writeFile(join(folder, "language.json"), "{ not json", "utf8")
    expect(readSavedLanguage(folder)).toBeNull()
  })
})

describe("the terminal's language", () => {
  it("puts the picked language after OH_MY_PAPER_LANG and before the system's", () => {
    const system = () => ["ko-KR"]
    expect(detectCliLocale({ LANG: "ko_KR.UTF-8" }, system, "en")).toBe("en")
    expect(detectCliLocale({}, system, "en")).toBe("en")
    expect(detectCliLocale({ OH_MY_PAPER_LANG: "ko" }, system, "en")).toBe("ko")
    expect(detectCliLocale({ LANG: "en_US.UTF-8" }, system, null)).toBe("en")
  })

  it("switches its wording as soon as a language is picked", () => {
    const before = cliLocale()
    const t = cliTranslator(cliMessages)
    try {
      setCliLocale("en")
      expect(t("help.usage")).toBe("Usage")
      setCliLocale("ko")
      expect(t("help.usage")).toBe("사용법")
    } finally {
      setCliLocale(before)
    }
  })
})

function LanguagePicker(): JSX.Element {
  const { locale, setPreference } = useLocale()
  return (
    <button type="button" onClick={() => setPreference("en")}>
      {locale}
    </button>
  )
}

describe("the app's language setting", () => {
  it("starts on the saved language and passes a new choice on", () => {
    const keep = vi.fn()
    render(
      <LocaleProvider initialPreference="ko" onPreferenceChange={keep}>
        <LanguagePicker />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "ko" }))
    expect(screen.getByRole("button", { name: "en" })).toBeVisible()
    expect(keep).toHaveBeenCalledWith("en")
  })
})
