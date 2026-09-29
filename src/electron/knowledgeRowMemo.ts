import type { SQLOutputValue } from "node:sqlite"

export type SqlRow = Readonly<Record<string, SQLOutputValue>>

type Entry<T> = { readonly row: SqlRow; readonly extra: string | null; readonly value: T }

function sameRow(left: SqlRow, right: SqlRow): boolean {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}

/** Freezes a JSON-like value and everything in it, so a memoized value stays as derived. */
export function deepFrozen<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFrozen(child)
    Object.freeze(value)
  }
  return value
}

/** The row's key column as text, for rows keyed by an id. */
export function rowKey(row: SqlRow, column: string): string {
  return String(row[column])
}

/**
 * Remembers what each row was projected into during the previous pass, so a row whose columns
 * (and `extra`, for inputs outside the row) are unchanged keeps the same value object without
 * being parsed and validated again. Only the latest pass is kept.
 */
export class RowMemo<T> {
  private entries = new Map<string, Entry<T>>()

  map(
    rows: readonly SqlRow[],
    keyOf: (row: SqlRow) => string,
    derive: (row: SqlRow) => T,
    extraOf: (row: SqlRow) => string | null = () => null,
  ): T[] {
    const next = new Map<string, Entry<T>>()
    const values = rows.map((row) => {
      const key = keyOf(row)
      const extra = extraOf(row)
      const known = this.entries.get(key)
      const value =
        known && known.extra === extra && sameRow(known.row, row) ? known.value : derive(row)
      next.set(key, { row, extra, value })
      return value
    })
    this.entries = next
    return values
  }
}
