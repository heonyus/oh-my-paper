import { expect, test } from "vitest"
import { createClosePreparation } from "../../../src/shared/closePreparation"

test("close waits for every writer and rejects any failed save", async () => {
  const preparation = createClosePreparation()
  let done = false
  preparation.register(async () => {})
  preparation.register(async () => {
    await Promise.resolve()
    done = true
  })
  await preparation.prepare()
  expect(done).toBe(true)
  const remove = preparation.register(async () => {
    throw new Error("disk full")
  })
  await expect(preparation.prepare()).rejects.toThrow("disk full")
  remove()
  await expect(preparation.prepare()).resolves.toBeUndefined()
})
