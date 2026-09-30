import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  activeDays,
  closedAs,
  MIN_ACTIVE_DAYS,
  markStarOpened,
  readStarInviteState,
  STAR_INVITE_STORAGE_KEY,
  type StarInviteState,
  shouldInvite,
  snoozed,
  writeStarInviteState,
} from "../../src/web/star/starInviteRules"

const FRESH: StarInviteState = { closed: null, nextAt: null, preview: false }
const NOW = new Date("2026-09-30T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

function stubStorage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  })
  return store
}

describe("star invitation rules", () => {
  beforeEach(() => {
    stubStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("counts distinct days with an import or a written note", () => {
    const documents = [
      { importedAt: "2026-09-01T12:00:00.000Z" },
      { importedAt: "2026-09-01T13:00:00.000Z" },
      { importedAt: "2026-09-04T12:00:00.000Z" },
    ]
    const notes = [
      { markdown: "  \n", updatedAt: "2026-09-10T12:00:00.000Z" },
      { markdown: "내가 이해한 것", updatedAt: "2026-09-08T12:00:00.000Z" },
      { markdown: "같은 날", updatedAt: "2026-09-04T13:00:00.000Z" },
      { markdown: "깨진 시각", updatedAt: "not a date" },
    ]
    expect(activeDays(documents, [])).toBe(2)
    expect(activeDays(documents, notes)).toBe(3)
    expect(activeDays([], [])).toBe(0)
  })

  it("waits for real use, a closed card, the wizard's choice and the snooze", () => {
    const base = { activeDays: MIN_ACTIVE_DAYS, wizardAnswer: null, state: FRESH, now: NOW }
    expect(shouldInvite(base)).toBe(true)
    expect(shouldInvite({ ...base, activeDays: MIN_ACTIVE_DAYS - 1 })).toBe(false)
    expect(shouldInvite({ ...base, wizardAnswer: "opened" })).toBe(false)
    expect(shouldInvite({ ...base, wizardAnswer: "skipped" })).toBe(true)
    expect(shouldInvite({ ...base, state: closedAs(FRESH, "never") })).toBe(false)
    expect(shouldInvite({ ...base, state: closedAs(FRESH, "opened") })).toBe(false)

    const later = snoozed(FRESH, NOW)
    expect(Date.parse(later.nextAt ?? "")).toBe(NOW.getTime() + 14 * DAY_MS)
    expect(shouldInvite({ ...base, state: later })).toBe(false)
    expect(
      shouldInvite({ ...base, state: later, now: new Date(NOW.getTime() + 15 * DAY_MS) }),
    ).toBe(true)
  })

  it("lets the QA preview skip only the activity threshold", () => {
    const preview: StarInviteState = { ...FRESH, preview: true }
    const base = { activeDays: 0, wizardAnswer: null, now: NOW }
    expect(shouldInvite({ ...base, state: preview })).toBe(true)
    expect(shouldInvite({ ...base, state: snoozed(preview, NOW) })).toBe(false)
    expect(shouldInvite({ ...base, state: closedAs(preview, "never") })).toBe(false)
  })

  it("reads damaged or partial storage as defaults, field by field", () => {
    expect(readStarInviteState()).toEqual(FRESH)
    window.localStorage.setItem(STAR_INVITE_STORAGE_KEY, "{broken")
    expect(readStarInviteState()).toEqual(FRESH)
    window.localStorage.setItem(STAR_INVITE_STORAGE_KEY, JSON.stringify({ preview: true }))
    expect(readStarInviteState()).toEqual({ ...FRESH, preview: true })
    window.localStorage.setItem(
      STAR_INVITE_STORAGE_KEY,
      JSON.stringify({ closed: "maybe", nextAt: "soon", preview: "yes" }),
    )
    expect(readStarInviteState()).toEqual(FRESH)
  })

  it("keeps working when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    })
    expect(readStarInviteState()).toEqual(FRESH)
    expect(() => writeStarInviteState(closedAs(FRESH, "never"))).not.toThrow()
  })

  it("remembers a click-through from anywhere without losing the snooze", () => {
    writeStarInviteState(snoozed(FRESH, NOW))
    markStarOpened()
    const state = readStarInviteState()
    expect(state.closed).toBe("opened")
    expect(state.nextAt).toBe(snoozed(FRESH, NOW).nextAt)
  })
})
