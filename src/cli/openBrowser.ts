import { execFile } from "node:child_process"

/** Opens a URL in the default browser without waiting for it or reporting failures. */
export function openBrowser(url: string): void {
  // `cmd /c start` would cut a URL at its first `&`; the Windows URL handler takes it whole.
  const [command, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]]
  execFile(command, args, () => undefined)
}
