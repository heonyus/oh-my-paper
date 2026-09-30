import { applyKeyMoves, type KeyMove, keyMoves } from "./keyOrder"
import { WorkspaceConflictError } from "./workspaceMerge"

/** The fields one record now sets, and the optional fields it no longer has. */
export type FieldChanges<F extends string> = {
  readonly set?: Partial<Record<F, unknown>> | undefined
  readonly unset?: readonly F[] | undefined
}

/** How one keyed collection changed; `replace` carries the whole collection when keys repeat. */
export type KeyedPatch<R, K extends string, F extends string> = {
  readonly replace?: readonly R[] | undefined
  readonly added?: readonly R[] | undefined
  readonly changed?: readonly (FieldChanges<F> & { readonly key: K })[] | undefined
  readonly removed?: readonly K[] | undefined
  readonly moves?: readonly KeyMove<K>[] | undefined
}

/** A workspace collection whose records are identified by `keyOf` and validated by `parse`. */
export type KeyedCollection<R, K extends string, F extends string> = {
  readonly name: string
  readonly keyOf: (record: R) => K
  readonly isField: (field: string) => field is F
  readonly parse: (value: unknown) => R
}

/** A type guard for the field names of one record schema. */
export function fieldGuard<F extends string>(fields: readonly F[]): (field: string) => field is F {
  const known: ReadonlySet<string> = new Set(fields)
  return (field): field is F => known.has(field)
}

/** Deep equality as JSON sees it: key order and undefined-valued keys do not count. */
export function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== "object" || typeof right !== "object" || !left || !right) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => sameJsonValue(item, right[index]))
  }
  const leftKeys = Object.keys(left).filter((key) => Reflect.get(left, key) !== undefined)
  const rightCount = Object.keys(right).filter((key) => Reflect.get(right, key) !== undefined)
  return (
    leftKeys.length === rightCount.length &&
    leftKeys.every((key) => sameJsonValue(Reflect.get(left, key), Reflect.get(right, key)))
  )
}

/** The field-level difference from one record to another, or undefined when JSON-equal. */
export function diffFields<F extends string>(
  from: object,
  to: object,
  isField: (field: string) => field is F,
): FieldChanges<F> | undefined {
  const set: Partial<Record<F, unknown>> = {}
  const unset: F[] = []
  for (const [field, value] of Object.entries(to)) {
    if (value !== undefined && isField(field) && !sameJsonValue(Reflect.get(from, field), value))
      set[field] = value
  }
  for (const [field, value] of Object.entries(from)) {
    if (value !== undefined && isField(field) && Reflect.get(to, field) === undefined)
      unset.push(field)
  }
  const hasSet = Object.keys(set).length > 0
  if (!hasSet && unset.length === 0) return undefined
  return { ...(hasSet ? { set } : {}), ...(unset.length > 0 ? { unset } : {}) }
}

/** Applies field changes to a record and validates the result as a whole record. */
export function applyFields<R extends object, F extends string>(
  base: R,
  changes: FieldChanges<F>,
  parse: (value: unknown) => R,
): R {
  const unset: ReadonlySet<string> = new Set(changes.unset ?? [])
  return parse(
    Object.fromEntries([
      ...Object.entries(base).filter(([field]) => !unset.has(field)),
      ...Object.entries(changes.set ?? {}),
    ]),
  )
}

function byUniqueKey<R, K extends string>(
  records: readonly R[],
  keyOf: (record: R) => K,
): ReadonlyMap<K, R> | undefined {
  const map = new Map<K, R>()
  for (const record of records) {
    const key = keyOf(record)
    if (map.has(key)) return undefined
    map.set(key, record)
  }
  return map
}

/** The keyed difference from one collection to another, or undefined when nothing changed. */
export function diffKeyed<R extends object, K extends string, F extends string>(
  collection: KeyedCollection<R, K, F>,
  from: readonly R[],
  to: readonly R[],
): KeyedPatch<R, K, F> | undefined {
  if (from === to) return undefined
  const fromByKey = byUniqueKey(from, collection.keyOf)
  const toByKey = byUniqueKey(to, collection.keyOf)
  if (!fromByKey || !toByKey) return sameJsonValue(from, to) ? undefined : { replace: to }
  const added: R[] = []
  const changed: (FieldChanges<F> & { readonly key: K })[] = []
  for (const [key, record] of toByKey) {
    const previous = fromByKey.get(key)
    if (previous === undefined) added.push(record)
    else if (previous !== record) {
      const changes = diffFields(previous, record, collection.isField)
      if (changes) changed.push({ key, ...changes })
    }
  }
  const removed = [...fromByKey.keys()].filter((key) => !toByKey.has(key))
  const natural = [...fromByKey.keys()]
    .filter((key) => toByKey.has(key))
    .concat(added.map(collection.keyOf))
  const moves = keyMoves(natural, [...toByKey.keys()])
  if (added.length + changed.length + removed.length + moves.length === 0) return undefined
  return {
    ...(added.length > 0 ? { added } : {}),
    ...(changed.length > 0 ? { changed } : {}),
    ...(removed.length > 0 ? { removed } : {}),
    ...(moves.length > 0 ? { moves } : {}),
  }
}

/**
 * Applies a keyed patch. Kept records stay in base order and added ones follow, then `moves`
 * reorder them. A change to a record the base lacks means the two sides disagree on the base.
 */
export function applyKeyed<R extends object, K extends string, F extends string>(
  collection: KeyedCollection<R, K, F>,
  base: readonly R[],
  patch: KeyedPatch<R, K, F> | undefined,
): readonly R[] {
  if (!patch) return base
  if (patch.replace) return patch.replace
  const records = new Map<string, R>(base.map((record) => [collection.keyOf(record), record]))
  for (const key of patch.removed ?? []) records.delete(key)
  for (const change of patch.changed ?? []) {
    const current = records.get(change.key)
    if (current === undefined) throw new WorkspaceConflictError(`${collection.name}:${change.key}`)
    const updated = applyFields(current, change, collection.parse)
    if (collection.keyOf(updated) !== change.key) {
      throw new Error(`Workspace patch changed the key of ${collection.name}:${change.key}`)
    }
    records.set(change.key, updated)
  }
  for (const record of patch.added ?? []) records.set(collection.keyOf(record), record)
  if (!patch.moves) return [...records.values()]
  return applyKeyMoves([...records.keys()], patch.moves).flatMap((key) => {
    const record = records.get(key)
    return record === undefined ? [] : [record]
  })
}
