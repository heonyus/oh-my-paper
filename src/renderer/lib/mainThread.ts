/**
 * Lets the browser handle input and draw a frame before the caller goes on, so work done in
 * steps does not hold the page still for the sum of them.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== "function") {
      setTimeout(resolve, 0)
      return
    }
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

/** How long `afterNextPaint` waits for a frame that never comes, as in a hidden tab. */
const PAINT_FALLBACK_MS = 120

/** Calls `run` once the browser has drawn a frame. Returns the call that cancels it. */
export function afterNextPaint(run: () => void): () => void {
  let frame: number | null = null
  let timer: number | null = null
  const cancel = (): void => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    if (timer !== null) window.clearTimeout(timer)
    frame = null
    timer = null
  }
  const finish = (): void => {
    cancel()
    run()
  }
  frame = window.requestAnimationFrame(() => {
    frame = null
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(finish, 0)
  })
  timer = window.setTimeout(finish, PAINT_FALLBACK_MS)
  return cancel
}

/** How long `whenIdle` waits for the page to go idle before running anyway. */
const IDLE_TIMEOUT_MS = 500

/**
 * Calls `run` when the page has nothing else to do, or after `patienceMs` when it stays busy.
 * Returns the call that cancels it.
 */
export function whenIdle(run: () => void, patienceMs = IDLE_TIMEOUT_MS): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: patienceMs })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = window.setTimeout(run, 32)
  return () => window.clearTimeout(timer)
}
