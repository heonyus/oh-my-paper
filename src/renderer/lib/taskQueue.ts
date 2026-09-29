export type TaskQueue = {
  readonly run: <T>(task: (signal: AbortSignal) => Promise<T>, signal: AbortSignal) => Promise<T>
  readonly counts: () => { readonly running: number; readonly waiting: number }
}

type WaitingTask = {
  readonly start: () => void
  readonly signal: AbortSignal
}

export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError")
}

/** Runs at most `limit` tasks at once, first come first served; a task aborted while waiting never starts. */
export function createTaskQueue(limit: number): TaskQueue {
  const waiting: WaitingTask[] = []
  let running = 0

  const startNext = (): void => {
    while (running < limit) {
      const next = waiting.shift()
      if (!next) return
      if (!next.signal.aborted) next.start()
    }
  }

  const run = <T>(task: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortReason(signal))
        return
      }
      const cancel = (): void => {
        const index = waiting.indexOf(entry)
        if (index >= 0) waiting.splice(index, 1)
        reject(abortReason(signal))
      }
      const entry: WaitingTask = {
        signal,
        start: () => {
          signal.removeEventListener("abort", cancel)
          running += 1
          Promise.resolve()
            .then(() => task(signal))
            .then(resolve, reject)
            .finally(() => {
              running -= 1
              startNext()
            })
        },
      }
      signal.addEventListener("abort", cancel, { once: true })
      waiting.push(entry)
      startNext()
    })

  return { run, counts: () => ({ running, waiting: waiting.length }) }
}
