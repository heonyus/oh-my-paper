import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  type Catalog,
  FALLBACK_LOCALE,
  isLocale,
  type Locale,
  localeFromTags,
  type MessageParams,
  translator,
} from "../../shared/i18n/locale"

/** `auto` follows the browser's language; the others pin one. */
export type LanguagePreference = "auto" | Locale

const STORAGE_KEY = "ohmypaper:language"

/** The browser's language, or English when it names one the app does not speak. */
export function browserLocale(): Locale {
  if (typeof navigator === "undefined") return FALLBACK_LOCALE
  return localeFromTags([...(navigator.languages ?? []), navigator.language]) ?? FALLBACK_LOCALE
}

function readPreference(): LanguagePreference {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(saved) ? saved : "auto"
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the browser decides.
    return "auto"
  }
}

function writePreference(preference: LanguagePreference): void {
  try {
    if (preference === "auto") window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Same as above: the choice then lasts until the page reloads.
  }
}

type LocaleState = {
  readonly locale: Locale
  readonly preference: LanguagePreference
  readonly setPreference: (preference: LanguagePreference) => void
}

// Outside the provider (tests, isolated renders) the browser's language still applies.
const LocaleContext = createContext<LocaleState>({
  locale: browserLocale(),
  preference: "auto",
  setPreference: () => undefined,
})

/** The app's language: the reader's choice, kept in this browser, or the browser's own. */
export function LocaleProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [preference, setState] = useState<LanguagePreference>(readPreference)
  const setPreference = useCallback((next: LanguagePreference): void => {
    writePreference(next)
    setState(next)
  }, [])
  const locale = preference === "auto" ? browserLocale() : preference
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  const value = useMemo(
    () => ({ locale, preference, setPreference }),
    [locale, preference, setPreference],
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleState {
  return useContext(LocaleContext)
}

/** `catalog`'s wording in the app's language. */
export function useTranslator<Source extends Readonly<Record<string, string>>>(
  catalog: Catalog<Source>,
): (key: keyof Source & string, params?: MessageParams) => string {
  const { locale } = useLocale()
  return useMemo(() => translator(catalog, locale), [catalog, locale])
}
