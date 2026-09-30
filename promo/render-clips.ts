/**
 * Renders the short looping clips the app's first-use tips play, from the same recordings as the
 * README video (plus tip-only ones in public/tip-timelines.json), into ../src/web/public/tutorials.
 *
 *   REMOTION_BROWSER=/path/to/chrome-headless-shell npm run render:clips
 *   npm run render:clips -- page-translation      # only these tips
 */
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "out", "tips")
const appDir = join(here, "..", "src", "web", "public", "tutorials")
mkdirSync(outDir, { recursive: true })
mkdirSync(appDir, { recursive: true })

/** Tip id → the recorded shots it plays, in order. */
const CLIPS: Record<string, readonly string[]> = {
  import: ["import", "import-ready"],
  translate: ["translate", "translate-result"],
  explain: ["explain", "explain-result"],
  "page-translation": ["page-translation", "page-translation-result"],
  note: ["note"],
  overview: ["overview"],
}

const browser = process.env.REMOTION_BROWSER
const only = new Set(process.argv.slice(2))
for (const [id, sceneIds] of Object.entries(CLIPS)) {
  if (only.size > 0 && !only.has(id)) continue
  const file = join(outDir, `${id}.mp4`)
  console.log(`▶ ${id}`)
  const result = spawnSync(
    "npx",
    [
      "remotion",
      "render",
      "src/index.ts",
      "Tip",
      file,
      `--props=${JSON.stringify({ sceneIds })}`,
      "--codec=h264",
      "--crf=26",
      "--log=error",
      ...(browser ? [`--browser-executable=${browser}`] : []),
    ],
    { cwd: here, stdio: "inherit" },
  )
  if (result.status !== 0) {
    console.error(`✖ ${id} — skipped (scene missing or render failed)`)
    continue
  }
  copyFileSync(file, join(appDir, `${id}.mp4`))
}
console.log(`✔ clips → ${appDir}`)
