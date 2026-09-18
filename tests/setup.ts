import "@testing-library/jest-dom/vitest"

// jsdom does not implement the native dialog lifecycle; real focus trapping is covered in Electron.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function (): void {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (): void {
    this.open = false
  }
}
