/** Whether the keyboard is an Apple one, whose ⌘ stands where Ctrl does elsewhere. */
export const APPLE_KEYBOARD = /Mac|iPhone|iPad|iPod/u.test(globalThis.navigator?.platform ?? "")
