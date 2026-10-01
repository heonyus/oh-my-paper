/** Offsets of the spaces in `text` that sit outside every bracket: "(dist–hist)", "[12](#…)". */
function openSpaces(text: string): readonly number[] {
  const spaces: number[] = []
  let depth = 0
  for (const [index, character] of [...text].entries()) {
    if (character === "(" || character === "[") depth += 1
    else if ((character === ")" || character === "]") && depth > 0) depth -= 1
    else if (depth === 0 && /\s/u.test(character)) spaces.push(index)
  }
  return spaces
}

/**
 * `text` cut into as many parts as `shares`, each about its share of the whole, at spaces
 * outside brackets, so no part opens or closes inside a gloss or a link. Null when the text
 * has too few such spaces to give every part some of it.
 */
export function cutInProportion(text: string, shares: readonly number[]): readonly string[] | null {
  const characters = [...text.trim()]
  const total = shares.reduce((sum, share) => sum + Math.max(0, share), 0)
  if (shares.length < 2 || total <= 0) return null
  const spaces = openSpaces(characters.join(""))
  const cuts: number[] = []
  let covered = 0
  for (const share of shares.slice(0, -1)) {
    covered += Math.max(0, share)
    const target = (covered / total) * characters.length
    const after = cuts.at(-1) ?? 0
    const nearest = spaces
      .filter((space) => space > after)
      .reduce<number | null>(
        (best, space) =>
          best === null || Math.abs(space - target) < Math.abs(best - target) ? space : best,
        null,
      )
    if (nearest === null) return null
    cuts.push(nearest)
  }
  const parts = [0, ...cuts].map((from, index) =>
    characters
      .slice(from, cuts[index] ?? characters.length)
      .join("")
      .trim(),
  )
  return parts.every((part) => part.length > 0) ? parts : null
}
