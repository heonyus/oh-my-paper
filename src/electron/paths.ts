import { join } from "node:path"

export function resolveRendererIndex(emittedElectronDirectory: string): string {
  return join(emittedElectronDirectory, "..", "..", "dist", "index.html")
}
