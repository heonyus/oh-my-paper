function definedKeys(value: object): readonly string[] {
  return Object.keys(value).filter((key) => Reflect.get(value, key) !== undefined)
}

/**
 * Equality of what JSON storage keeps: a property holding `undefined` counts as absent. The
 * save merge spells out optional fields such as `lastReadPage: undefined`, which strict deep
 * equality treated as a change, rewriting every unread paper on every save.
 */
export function storedValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null)
    return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => storedValueEqual(item, right[index]))
  }
  const leftKeys = definedKeys(left)
  return (
    leftKeys.length === definedKeys(right).length &&
    leftKeys.every((key) => storedValueEqual(Reflect.get(left, key), Reflect.get(right, key)))
  )
}
