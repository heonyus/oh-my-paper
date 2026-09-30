import "@testing-library/jest-dom/vitest"

// Tests read the Korean wording unless they pick a language themselves, whatever the machine's locale.
process.env["OH_MY_PAPER_LANG"] ??= "ko"
if (typeof navigator !== "undefined") {
  Object.defineProperty(navigator, "languages", { configurable: true, get: () => ["ko-KR"] })
  Object.defineProperty(navigator, "language", { configurable: true, get: () => "ko-KR" })
}

// jsdom does not implement the native dialog lifecycle; real focus trapping is covered in Electron.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function (): void {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (): void {
    this.open = false
  }
}
