/** One record placed right after `after`, or first when `after` is null. */
export type KeyMove<K extends string> = { readonly key: K; readonly after: K | null }

/** The keys of `target` that keep their relative `natural` order: a longest increasing run. */
function keptKeys<K extends string>(natural: readonly K[], target: readonly K[]): ReadonlySet<K> {
  const position = new Map(natural.map((key, index) => [key, index]))
  const ranks = target.map((key) => position.get(key) ?? -1)
  const tails: number[] = []
  const previous: number[] = []
  ranks.forEach((rank, index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if ((ranks[tails[middle] ?? 0] ?? 0) < rank) low = middle + 1
      else high = middle
    }
    previous[index] = low > 0 ? (tails[low - 1] ?? -1) : -1
    tails[low] = index
  })
  const kept = new Set<K>()
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index] ?? -1) {
    const key = target[index]
    if (key !== undefined) kept.add(key)
  }
  return kept
}

/**
 * The fewest single-record moves, each anchored to its new predecessor, that turn the `natural`
 * key order into `target`; both hold the same keys. Empty when the orders already agree.
 */
export function keyMoves<K extends string>(
  natural: readonly K[],
  target: readonly K[],
): readonly KeyMove<K>[] {
  if (natural.every((key, index) => key === target[index])) return []
  const kept = keptKeys(natural, target)
  return target.flatMap((key, index) =>
    kept.has(key) ? [] : [{ key, after: index === 0 ? null : (target[index - 1] ?? null) }],
  )
}

/**
 * Reorders `natural` by `moves`. A move whose anchor is missing, which only happens when the two
 * sides disagree on the base, leaves its record at the end rather than dropping it.
 */
export function applyKeyMoves<K extends string>(
  natural: readonly K[],
  moves: readonly KeyMove<K>[],
): readonly K[] {
  const present: ReadonlySet<K> = new Set(natural)
  const moved = new Set(moves.map((move) => move.key).filter((key) => present.has(key)))
  const following = new Map<K | null, K>()
  for (const move of moves) if (moved.has(move.key)) following.set(move.after, move.key)
  const ordered: K[] = []
  const placed = new Set<K>()
  const emitChain = (anchor: K | null): void => {
    for (let key = following.get(anchor); key !== undefined; key = following.get(key)) {
      if (placed.has(key)) return
      placed.add(key)
      ordered.push(key)
    }
  }
  emitChain(null)
  for (const key of natural) {
    if (moved.has(key)) continue
    placed.add(key)
    ordered.push(key)
    emitChain(key)
  }
  return [...ordered, ...natural.filter((key) => !placed.has(key))]
}
