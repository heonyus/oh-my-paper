import { describe, expect, it } from "vitest"
import { applyKeyMoves, keyMoves } from "../../src/shared/keyOrder"
import { seededRandom } from "../support/workspacePatchFixtures"

function shuffled(keys: readonly string[], random: () => number): string[] {
  const result = [...keys]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    const current = result[index]
    const swap = result[other]
    if (current === undefined || swap === undefined) continue
    result[index] = swap
    result[other] = current
  }
  return result
}

describe("key order moves", () => {
  it("reproduces any permutation of the natural order", () => {
    const random = seededRandom(31)
    for (let round = 0; round < 300; round += 1) {
      const natural = Array.from({ length: Math.floor(random() * 30) }, (_, index) => `k${index}`)
      const target = random() < 0.5 ? shuffled(natural, random) : [...natural]

      expect(applyKeyMoves(natural, keyMoves(natural, target))).toEqual(target)
    }
  })

  it("moves one record when a paper jumps to the front of a long list", () => {
    const natural = Array.from({ length: 500 }, (_, index) => `paper-${index}`)
    const target = ["paper-321", ...natural.filter((key) => key !== "paper-321")]

    expect(keyMoves(natural, target)).toEqual([{ key: "paper-321", after: null }])
    expect(keyMoves(natural, natural)).toEqual([])
  })

  it("keeps records whose anchor is missing instead of dropping them", () => {
    expect(
      applyKeyMoves(
        ["a", "b", "c"],
        [
          { key: "a", after: "gone" },
          { key: "b", after: "c" },
          { key: "c", after: "b" },
        ],
      ),
    ).toEqual(["a", "b", "c"])
  })
})
