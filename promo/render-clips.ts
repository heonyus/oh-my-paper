/**
 * Renders the short looping clips the app's first-use tips play, from the same recordings as the
 * README video (plus tip-only ones in public/tip-timelines.json), into ../src/web/public/tutorials.
 *
 *   REMOTION_BROWSER=/path/to/chrome-headless-shell npm run render:clips
 *   npm run render:clips -- page-translation      # only these tips
 *   CLIP_LOCALE=en npm run render:clips            # the English clips, from timelines-en.json
 */
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const english = process.env.CLIP_LOCALE === "en"
const outDir = join(here, "out", english ? "tips-en" : "tips")
const appDir = join(here, "..", "src", "web", "public", "tutorials", ...(english ? ["en"] : []))
/** The Korean clips come from the README recordings; the English ones from their own. */
const lists = english ? ["timelines-en.json"] : ["timelines.json", "tip-timelines.json"]
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

/** An English paper translated into English stays the same, so the app shows other clips there. */
const KOREAN_ONLY = new Set(["translate", "page-translation"])

const browser = process.env.REMOTION_BROWSER
const only = new Set(process.argv.slice(2))
for (const [id, sceneIds] of Object.entries(CLIPS)) {
  if (only.size > 0 && !only.has(id)) continue
  if (english && KOREAN_ONLY.has(id)) continue
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
      `--props=${JSON.stringify({ sceneIds, lists })}`,
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
