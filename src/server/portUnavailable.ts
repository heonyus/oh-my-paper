/** The exit status for a port the server cannot have; the Windows tray stops restarting it. */
export const PORT_UNAVAILABLE_EXIT_CODE = 78

/** One line for a port the server cannot listen on, with what to do about it; null otherwise. */
export function portUnavailableMessage(
  code: string | undefined,
  host: string,
  port: number,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (code === "EADDRINUSE")
    return `Port ${port} on ${host} is already in use — is oh-my-paper already running? Another port: OH_MY_PAPER_WEB_PORT=<port>`
  if (code !== "EACCES") return null
  // Hyper-V, WSL 2 and Docker reserve port ranges on Windows, and binding in one is refused.
  const reserved =
    platform === "win32"
      ? " Windows may reserve it (see: netsh interface ipv4 show excludedportrange protocol=tcp)."
      : ""
  return `Port ${port} on ${host} cannot be used.${reserved} Another port: OH_MY_PAPER_WEB_PORT=<port>`
}
