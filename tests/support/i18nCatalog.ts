import { expect } from "vitest"
import { type Catalog, LOCALES } from "../../src/shared/i18n/locale"

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort()

/** Every language has every key, none empty, with the same placeholders as the Korean source. */
export function expectCompleteCatalog(catalog: Catalog<Readonly<Record<string, string>>>): void {
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
