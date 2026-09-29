import { describe, expect, it } from "vitest"
import { createTaskQueue } from "../../src/renderer/lib/taskQueue"

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
}

describe("bounded task queue", () => {
  it("runs at most the limit at once and starts waiting tasks in order", async () => {
    const queue = createTaskQueue(2)
    const gates = [deferred(), deferred(), deferred()]
    const started: number[] = []
    const results = gates.map((gate, index) =>
      queue.run(async () => {
        started.push(index)
        await gate.promise
        return index
      }, new AbortController().signal),
    )

    await flush()
    expect(started).toEqual([0, 1])
    expect(queue.counts()).toEqual({ running: 2, waiting: 1 })

    gates[1]?.resolve()
    await flush()
    expect(started).toEqual([0, 1, 2])

    gates[0]?.resolve()
    gates[2]?.resolve()
    expect(await Promise.all(results)).toEqual([0, 1, 2])
    expect(queue.counts()).toEqual({ running: 0, waiting: 0 })
  })

  it("drops a task aborted while waiting without ever starting it", async () => {
    const queue = createTaskQueue(1)
    const gate = deferred()
    const started: string[] = []
    const first = queue.run(async () => {
      started.push("first")
      await gate.promise
    }, new AbortController().signal)
    const controller = new AbortController()
    const second = queue.run(async () => {
      started.push("second")
    }, controller.signal)
    const third = queue.run(async () => {
      started.push("third")
    }, new AbortController().signal)

    controller.abort()
    await expect(second).rejects.toMatchObject({ name: "AbortError" })
    expect(queue.counts()).toEqual({ running: 1, waiting: 1 })

    gate.resolve()
    await Promise.all([first, third])
    expect(started).toEqual(["first", "third"])
  })

  it("frees its slot when a task fails", async () => {
    const queue = createTaskQueue(1)
    const failed = queue.run(async () => {
      throw new Error("render_failed")
    }, new AbortController().signal)
    const next = queue.run(async () => "next", new AbortController().signal)

    await expect(failed).rejects.toThrow("render_failed")
    expect(await next).toBe("next")
  })
})
