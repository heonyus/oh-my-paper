function sameRecord<T>(left: T | undefined, right: T | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Three-way merge of records keyed by `keyOf`: a record the incoming side changed since the base
 * wins; otherwise the current side is kept, so a stale writer cannot undo newer content. A record
 * missing from the incoming side is dropped only when the current side still matches the base.
 */
export function mergeKeyedRecords<T>(
  base: readonly T[],
  current: readonly T[],
  incoming: readonly T[],
  keyOf: (record: T) => string,
): readonly T[] {
  const baseByKey = new Map(base.map((record) => [keyOf(record), record]))
  const incomingByKey = new Map(incoming.map((record) => [keyOf(record), record]))
  const result = new Map(current.map((record) => [keyOf(record), record]))
  for (const [key, record] of incomingByKey) {
    if (!sameRecord(baseByKey.get(key), record)) result.set(key, record)
  }
  for (const [key, record] of baseByKey) {
    if (incomingByKey.has(key)) continue
    if (sameRecord(result.get(key), record)) result.delete(key)
  }
  return [...result.values()]
}
