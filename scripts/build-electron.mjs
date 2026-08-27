import { rm } from "node:fs/promises"
import { build } from "esbuild"

const outputDirectory = "dist-electron/electron"
await rm("dist-electron", { recursive: true, force: true })

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
}

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/electron/main.ts"],
    outfile: `${outputDirectory}/main.js`,
  }),
  build({
    ...shared,
    entryPoints: ["src/electron/preload.ts"],
    outfile: `${outputDirectory}/preload.js`,
  }),
])
