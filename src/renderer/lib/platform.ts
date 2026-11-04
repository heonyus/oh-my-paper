/** Whether the keyboard is an Apple one, whose ⌘ stands where Ctrl does elsewhere. */
export const APPLE_KEYBOARD = /Mac|iPhone|iPad|iPod/u.test(globalThis.navigator?.platform ?? "")

/**
 * Marks the page when scrollbars take room, as Windows' classic ones do, so narrow panels can
 * ask for thin ones there; the overlay scrollbars of macOS take none and are left as they are.
 */
export function markClassicScrollbars(root: HTMLElement = document.documentElement): boolean {
  const probe = document.createElement("div")
  probe.style.cssText = "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll"
  document.body.append(probe)
  const classic = probe.offsetWidth - probe.clientWidth > 0
  probe.remove()
  if (classic) root.dataset["scrollbars"] = "classic"
  return classic
}
