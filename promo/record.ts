/**
 * Records real use of a running oh-my-paper app for the README video and the in-app tips.
 *
 *   APP_URL=http://127.0.0.1:8805 DEMO_PDF=/path/paper.pdf npm run record
 *
 * A headless Chromium drives the app with eased pointer paths, while CDP screencast frames
 * (2x device pixels) and every pointer/key event are saved. The result is public/rec-<OUT_NAME>.mp4
 * plus public/timeline-<OUT_NAME>.json; public/timelines.json lists which recordings the video uses.
 * SCENES=library,translate limits the run; the AI steps use whatever the app is connected to.
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

type Box = { x: number; y: number; w: number; h: number }
type Event = {
  t: number
  type: "move" | "down" | "up" | "key"
  x?: number
  y?: number
  key?: string
}
type Scene = {
  id: string
  start: number
  end: number
  caption: string
  keys?: string[]
  zoomIn?: boolean
  zoomOut?: boolean
  focus?: Box
}

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, "..", "package.json"))
const { chromium } = require("playwright") as typeof import("playwright")

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:8805"
const DEMO_PDF = process.env.DEMO_PDF ?? ""
const ONLY = new Set((process.env.SCENES ?? "").split(",").filter(Boolean))
const NAME = process.env.OUT_NAME ?? "main"
/** The app's language on camera: `ko` (default) or `en`. */
const LOCALE = process.env.LOCALE === "en" ? "en" : "ko"

/** Controls the recorder finds by their accessible names, and what it shows or types, per language. */
const TEXT = {
  ko: {
    zoomOut: "축소",
    copyCard: "카드 내용 복사",
    mainMenu: "주 메뉴",
    hideMinimap: "미니맵 숨기기",
    closeCard: "카드 닫기",
    noteBody: "내 노트 본문",
    captionImport: "PDF를 끌어다 놓거나 가져오기",
    captionImportReady: "제목·저자를 읽고, 페이지 구조부터 분석합니다",
    captionOpen: "원문 그대로, 연속 페이지로 읽기",
    captionTranslate: "문장을 고르고",
    captionExplain: "어려운 문장은",
    captionPageTranslation: "페이지를 통째로 번역",
    captionNote: "노트에 담고, 내 말로",
    captionOverview: "AI 개요",
    noteText: "예시에 중간 추론 단계를 넣기만 해도, 큰 모델은 산수 문제를 훨씬 잘 푼다.",
  },
  en: {
    zoomOut: "Zoom out",
    copyCard: "Copy card content",
    mainMenu: "Main menu",
    hideMinimap: "Hide minimap",
    closeCard: "Close card",
    noteBody: "My note text",
    captionImport: "Drop in a PDF, or import one",
    captionImportReady: "Title and authors first, then the page layout",
    captionOpen: "The original, page after page",
    captionTranslate: "Select a sentence",
    captionExplain: "Hard sentences, explained",
    captionPageTranslation: "Translate a whole page",
    captionNote: "Into your notes, in your words",
    captionOverview: "AI overview",
    noteText:
      "Just adding intermediate reasoning steps to the examples makes large models far better at arithmetic.",
  },
}[LOCALE]
const VIEWPORT = { w: 1440, h: 900 }
const FPS = 30
const frameDir = join(here, "public", "frames")

rmSync(frameDir, { recursive: true, force: true })
mkdirSync(frameDir, { recursive: true })

// Full Chromium in new headless mode; the headless shell was being shut down mid-run.
const browser = await chromium.launch({ headless: true, channel: "chromium" })
const context = await browser.newContext({
  viewport: { width: VIEWPORT.w, height: VIEWPORT.h },
  deviceScaleFactor: 2,
  colorScheme: "light",
  locale: LOCALE === "en" ? "en-US" : "ko-KR",
})
// Recordings show the product, not its first-run tips.
await context.addInitScript((language) => {
  window.localStorage.setItem("ohmypaper:language", language)
  window.localStorage.setItem("ohmypaper:feature-tips:v1", JSON.stringify({ seen: [], off: true }))
  // Meaning search would download its embedding model into the recording profile.
  window.localStorage.setItem("ohmypaper:note-companion", "quiet")
}, LOCALE)
const page = await context.newPage()
page.on("crash", () => console.error("✖ page crashed"))
page.on("close", () => console.error("✖ page closed"))
browser.on("disconnected", () => console.error("✖ browser disconnected"))
if (process.env.DEBUG_NET) {
  const started = new Map<string, number>()
  page.on("request", (request) => {
    if (request.url().includes("/api/") && !request.url().includes("parseDocumentPage"))
      started.set(request.url() + request.method(), Date.now())
  })
  page.on("requestfinished", async (request) => {
    const key = request.url() + request.method()
    const begin = started.get(key)
    if (begin === undefined) return
    const response = await request.response()
    console.error(
      `  net ${response?.status()} ${Date.now() - begin}ms ${request.url().replace(APP_URL, "")}`,
    )
  })
  page.on("requestfailed", (request) =>
    console.error(`  net FAILED ${request.failure()?.errorText} ${request.url()}`),
  )
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      console.error(`  console ${message.type()}: ${message.text().slice(0, 200)}`)
  })
}
const cdp = await context.newCDPSession(page)

const t0 = Date.now()
const now = (): number => (Date.now() - t0) / 1000
const frames: Array<{ file: string; t: number }> = []
const events: Event[] = []
const scenes: Scene[] = []
/** The longest AI wait inside the running scene, cut out of the video as a jump cut. */
let wait: { start: number; end: number } | null = null
function markWait(start: number): void {
  const end = now()
  if (!wait || end - start > wait.end - wait.start) wait = { start, end }
}
let pointer = { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2 }

const writes: Promise<void>[] = []
let lastFrameAt = 0
cdp.on("Page.screencastFrame", (frame) => {
  void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined)
  const file = join(frameDir, `${String(frames.length).padStart(6, "0")}.jpg`)
  // Large frames can arrive late; the capture timestamp keeps the video in step with the events.
  const captured = frame.metadata.timestamp
  frames.push({ file, t: captured ? captured - t0 / 1000 : now() })
  lastFrameAt = Date.now()
  writes.push(writeFile(file, Buffer.from(frame.data, "base64")))
})

let captureStart = 0
let capturing = false
let heartbeatBusy = false

/**
 * The screencast can stop sending frames after an animation ends even though the page keeps
 * changing, so a quiet stretch is filled with real screenshots.
 */
const heartbeat = setInterval(() => {
  if (!capturing || heartbeatBusy || Date.now() - lastFrameAt < 400) return
  heartbeatBusy = true
  const t = now()
  void cdp
    .send("Page.captureScreenshot", { format: "jpeg", quality: 90 })
    .then(({ data }) => {
      if (!capturing) return
      const file = join(frameDir, `${String(frames.length).padStart(6, "0")}.jpg`)
      frames.push({ file, t })
      lastFrameAt = Date.now()
      writes.push(writeFile(file, Buffer.from(data, "base64")))
    })
    .catch(() => undefined)
    .finally(() => {
      heartbeatBusy = false
    })
}, 200)

async function startCapture(): Promise<void> {
  captureStart = now()
  capturing = true
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: VIEWPORT.w * 2,
    maxHeight: VIEWPORT.h * 2,
    everyNthFrame: 2,
  })
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

/** Moves the pointer along an eased, slightly curved path, logging every step. */
async function glide(x: number, y: number, ms = 700): Promise<void> {
  const from = { ...pointer }
  const steps = Math.max(8, Math.round(ms / 16))
  const bend = { x: (y - from.y) * 0.08, y: (from.x - x) * 0.08 }
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps)
    const arc = Math.sin(Math.PI * k)
    const px = from.x + (x - from.x) * k + bend.x * arc
    const py = from.y + (y - from.y) * k + bend.y * arc
    await page.mouse.move(px, py)
    events.push({ t: now(), type: "move", x: px, y: py })
    await sleep(16)
  }
  pointer = { x, y }
}

async function click(x: number, y: number, ms = 650): Promise<void> {
  await glide(x, y, ms)
  await sleep(120)
  events.push({ t: now(), type: "down", x, y })
  await page.mouse.down()
  await sleep(70)
  await page.mouse.up()
  events.push({ t: now(), type: "up", x, y })
}

async function clickSelector(selector: string, ms?: number): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Not on screen: ${selector}`)
  await click(box.x + box.width / 2, box.y + box.height / 2, ms)
  return { x: box.x, y: box.y, w: box.width, h: box.height }
}

async function drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await glide(from.x, from.y)
  await sleep(150)
  events.push({ t: now(), type: "down", ...from })
  await page.mouse.down()
  const steps = 40
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps)
    const px = from.x + (to.x - from.x) * k
    const py = from.y + (to.y - from.y) * k
    await page.mouse.move(px, py)
    events.push({ t: now(), type: "move", x: px, y: py })
    await sleep(18)
  }
  await page.mouse.up()
  events.push({ t: now(), type: "up", ...to })
  pointer = { ...to }
}

async function press(key: string): Promise<void> {
  events.push({ t: now(), type: "key", key })
  await page.keyboard.press(key)
}

function union(...boxes: Array<Box | null | undefined>): Box | undefined {
  const present = boxes.filter((box): box is Box => Boolean(box))
  if (present.length === 0) return undefined
  const x = Math.min(...present.map((box) => box.x))
  const y = Math.min(...present.map((box) => box.y))
  const right = Math.max(...present.map((box) => box.x + box.w))
  const bottom = Math.max(...present.map((box) => box.y + box.h))
  const pad = 24
  return { x: x - pad, y: y - pad, w: right - x + pad * 2, h: bottom - y + pad * 2 }
}

async function boxOf(selector: string): Promise<Box | null> {
  const box = await page
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null)
  return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null
}

async function scene(
  id: string,
  caption: string,
  keys: string[] | undefined,
  run: () => Promise<Box | undefined>,
): Promise<void> {
  if (ONLY.size > 0 && !ONLY.has(id)) return
  const start = now()
  wait = null
  console.log(`▶ ${id}`)
  const focus = await run()
  await sleep(1200)
  const end = now()
  const extra = { ...(keys ? { keys } : {}), ...(focus ? { focus } : {}) }
  const cut = wait as { start: number; end: number } | null
  if (cut && cut.end - cut.start > 6) {
    // Keep the request and the first moment of loading, then jump to just before the answer.
    console.log(`  cut ${(cut.end - cut.start).toFixed(1)}s of waiting`)
    scenes.push({
      id,
      start: Math.max(0, start - 0.2),
      end: cut.start + 2.2,
      caption,
      zoomOut: false,
      ...extra,
    })
    scenes.push({ id: `${id}-result`, start: cut.end - 1.2, end, caption, zoomIn: false, ...extra })
  } else {
    scenes.push({ id, start: Math.max(0, start - 0.2), end, caption, ...extra })
  }
}

/** Two lines of body text starting with `prefix`, as drag points; scrolls them into view first. */
async function linePair(
  prefix: string,
): Promise<{ from: { x: number; y: number }; to: { x: number; y: number }; box: Box } | null> {
  const locate = () =>
    page.evaluate((start) => {
      const spans = [...document.querySelectorAll(".textLayer span")]
      const index = spans.findIndex((span) => (span.textContent ?? "").trim().startsWith(start))
      if (index < 0) return null
      const first = spans[index]?.getBoundingClientRect()
      if (!first) return null
      const next = spans
        .slice(index + 1)
        .find((span) => {
          const rect = span.getBoundingClientRect()
          return (
            rect.top > first.top + first.height * 0.6 && (span.textContent ?? "").trim().length > 20
          )
        })
        ?.getBoundingClientRect()
      const second = next ?? first
      return {
        a: { x: first.x, y: first.y, w: first.width, h: first.height },
        b: { x: second.x, y: second.y, w: second.width, h: second.height },
      }
    }, prefix)
  let found = await locate()
  if (!found) return null
  if (found.a.y < 200 || found.b.y > VIEWPORT.h - 220) {
    await glide(VIEWPORT.w * 0.42, VIEWPORT.h * 0.55, 500)
    await smoothScroll(found.a.y - VIEWPORT.h * 0.42)
    await sleep(500)
    found = await locate()
    if (!found) return null
  }
  const { a, b } = found
  const box = union(a, b)
  return {
    from: { x: a.x + 1, y: a.y + a.h / 2 },
    to: { x: b.x + b.w - 1, y: b.y + b.h / 2 },
    box: box ?? a,
  }
}

async function smoothScroll(dy: number): Promise<void> {
  const steps = Math.max(6, Math.ceil(Math.abs(dy) / 30))
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps)
    await sleep(16)
  }
}

/** Scrolls the board sideways the way a trackpad does; positive moves the content left. */
async function smoothPanX(dx: number): Promise<void> {
  const steps = Math.max(6, Math.ceil(Math.abs(dx) / 30))
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(dx / steps, 0)
    await sleep(16)
  }
}

/**
 * Brings a page and the translation beside it fully on screen, as a reader would: zoom out until
 * the pair fits the board, then slide it to the middle.
 */
async function framePageTranslation(): Promise<void> {
  const room = VIEWPORT.w - 72
  for (let i = 0; i < 8; i++) {
    const page1 = await boxOf('.page[data-page-number="1"]')
    const pane = await boxOf(".page-translation-pane")
    if (!page1 || !pane) return
    const width = pane.x + pane.w - page1.x
    if (width > room - 48) {
      await clickSelector(`button[aria-label="${TEXT.zoomOut}"]`, 450)
      // The pane keeps its old place until the zoomed page is drawn.
      await sleep(1500)
      continue
    }
    const dx = page1.x - (room - width) / 2
    if (Math.abs(dx) <= 12) return
    // Each pass measures again, since a pan can land short while the board settles.
    if (i === 0 || pointer.x > page1.x + page1.w)
      await glide(page1.x + page1.w * 0.5, VIEWPORT.h * 0.55, 500)
    await smoothPanX(dx)
    await sleep(800)
  }
}

/** Waits until the newest card of a kind shows its finished answer (the copy action appears). */
async function waitForCard(kind: string, timeoutMs = 150_000): Promise<Box | null> {
  const started = now()
  await page
    .waitForFunction(
      (cardKind) =>
        [...document.querySelectorAll(`.board-card[data-kind="${cardKind.kind}"]`)].some((card) =>
          card.querySelector(`button[aria-label="${cardKind.copy}"]`),
        ),
      { kind, copy: TEXT.copyCard },
      { timeout: timeoutMs, polling: 250 },
    )
    .catch(() => console.error(`  ${kind} card did not finish in time`))
  markWait(started)
  await sleep(600)
  return boxOf(`.board-card[data-kind="${kind}"] >> nth=-1`)
}

/** Streaming text settles when it stops changing for a while. */
async function waitForQuiet(
  selector: string,
  timeoutMs = 90_000,
  minLength = 20,
  stableMs = 3000,
): Promise<void> {
  const started = now()
  const deadline = Date.now() + timeoutMs
  let last = ""
  let stableSince = Date.now()
  while (Date.now() < deadline) {
    const text =
      (await page
        .locator(selector)
        .last()
        .textContent()
        .catch(() => "")) ?? ""
    if (text !== last) {
      last = text
      stableSince = Date.now()
    } else if (text.length > minLength && Date.now() - stableSince > stableMs) {
      // The answer finished when the text last changed.
      wait = { start: started, end: now() - stableMs / 1000 }
      return
    }
    await sleep(250)
  }
  console.error(`  ${selector} kept changing until the timeout`)
}

const libraryShown = () =>
  page
    .locator(".library-reader-action")
    .first()
    .isVisible()
    .catch(() => false)
const readerShown = () =>
  page
    .locator(".textLayer span")
    .first()
    .isVisible()
    .catch(() => false)

async function showLibrary(): Promise<void> {
  if (await libraryShown()) return
  await page
    .locator(`nav[aria-label="${TEXT.mainMenu}"] button`)
    .first()
    .click()
    .catch(() => undefined)
  await page
    .locator(".library-reader-action")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined)
}

async function hideMinimap(): Promise<void> {
  await page
    .locator(`button[aria-label="${TEXT.hideMinimap}"]`)
    .first()
    .click({ timeout: 800 })
    .catch(() => undefined)
}

/** Earlier runs leave cards on the board; each scene starts from a clean page. */
async function clearCards(): Promise<void> {
  // Cards can be stacked, so the close buttons are pressed in the page rather than by pointer.
  for (let i = 0; i < 30; i++) {
    const closed = await page.evaluate((label) => {
      const button = document.querySelector<HTMLButtonElement>(
        `.board-card button[aria-label="${label}"]`,
      )
      button?.click()
      return Boolean(button)
    }, TEXT.closeCard)
    if (!closed) break
    await sleep(300)
  }
}

async function showReader(): Promise<void> {
  if (!(await readerShown())) {
    await showLibrary()
    await page.locator(".library-reader-action").first().click()
    await page.locator(".textLayer span").first().waitFor({ timeout: 60_000 })
    await sleep(1500)
  }
  await hideMinimap()
  await clearCards()
}

// Off camera: put the app where the first requested scene begins.
await page.goto(APP_URL)
await page.waitForLoadState("networkidle")
const first = ONLY.size > 0 ? [...ONLY][0] : "import"
if (first === "import" || first === "open") await showLibrary()
else await showReader()
await sleep(800)
await startCapture()
await sleep(800)

await scene("import", TEXT.captionImport, undefined, async () => {
  if (!DEMO_PDF) return undefined
  const chooser = page.waitForEvent("filechooser")
  const button = await clickSelector(".library-empty button, .library-import-button")
  await (await chooser).setFiles(DEMO_PDF)
  await sleep(2600)
  return union(button, await boxOf(".library-home"))
})

// The paper settles in the library while its pages are read.
await scene("import-ready", TEXT.captionImportReady, undefined, async () => {
  await sleep(5800)
  return (await boxOf(".library-home")) ?? undefined
})

await scene("open", TEXT.captionOpen, undefined, async () => {
  await clickSelector(".library-reader-action")
  await page.locator(".textLayer span").first().waitFor({ timeout: 60_000 })
  await hideMinimap()
  await sleep(1600)
  await glide(VIEWPORT.w * 0.42, VIEWPORT.h * 0.6, 600)
  await smoothScroll(420)
  await sleep(1200)
  await smoothScroll(-420)
  await sleep(800)
  return undefined
})

await scene("translate", TEXT.captionTranslate, ["T"], async () => {
  const sentence = await linePair("Experiments on three large")
  if (!sentence) return undefined
  await drag(sentence.from, sentence.to)
  await sleep(800)
  const menu = await boxOf(".selection-menu")
  await press("t")
  const card = await waitForCard("translation")
  await sleep(1200)
  return union(sentence.box, menu, card)
})

await scene("explain", TEXT.captionExplain, ["E"], async () => {
  const sentence = await linePair("We explore how generating")
  if (!sentence) return undefined
  await drag(sentence.from, sentence.to)
  await sleep(800)
  await press("e")
  const card = await waitForCard("explanation")
  await sleep(1500)
  return union(sentence.box, card)
})

await scene("page-translation", TEXT.captionPageTranslation, undefined, async () => {
  await clickSelector(".topbar-translation-action")
  await page
    .locator(".page-translation-pane")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined)
  await sleep(600)
  // At 1440 px the pane opens past the right edge of the board.
  await framePageTranslation()
  await waitForQuiet(".page-translation-pane", 240_000, 200, 5000)
  await sleep(1200)
  return union(await boxOf('.page[data-page-number="1"]'), await boxOf(".page-translation-pane"))
})

await scene("note", TEXT.captionNote, ["C"], async () => {
  const sentence = await linePair("naturally in suf")
  if (!sentence) return undefined
  await drag(sentence.from, sentence.to)
  await sleep(700)
  await press("c")
  await page
    .locator(`[aria-label="${TEXT.noteBody}"]`)
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined)
  await sleep(1000)
  for (const char of TEXT.noteText) {
    await page.keyboard.type(char)
    await sleep(60)
  }
  await sleep(1800)
  return union(sentence.box, await boxOf(".note-pane"))
})

await scene("overview", TEXT.captionOverview, undefined, async () => {
  await clickSelector('button[data-research-mode="ai"]').catch(() => undefined)
  await page
    .locator(".ai-overview-panel")
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined)
  await waitForQuiet(".ai-overview-panel", 200_000, 200, 5000)
  await sleep(1000)
  return (await boxOf(".ai-overview-panel")) ?? undefined
})

const captureEnd = now()
capturing = false
clearInterval(heartbeat)
await cdp.send("Page.stopScreencast").catch(() => undefined)
// Let frames still in flight arrive before closing.
while (Date.now() - lastFrameAt < 1500) await sleep(250)
await Promise.all(writes)
frames.sort((a, b) => a.t - b.t)
await Promise.race([browser.close(), sleep(10_000)])

// The video starts when capture started; the first repaint is held until then.
const firstFrame = captureStart
if (frames[0] && frames[0].t > captureStart) frames[0].t = captureStart

// Hold each frame until the next one arrives, at a constant 30 fps.
const list = frames
  .map((frame, index) => {
    const next = frames[index + 1]?.t ?? Math.max(captureEnd, frame.t + 1 / FPS)
    // Real spacing; ffmpeg's fps filter then resamples to a constant rate.
    return `file '${frame.file}'\nduration ${Math.max(0.001, next - frame.t).toFixed(4)}`
  })
  .join("\n")
writeFileSync(join(frameDir, "frames.json"), JSON.stringify(frames.map((frame) => frame.t)))
writeFileSync(join(frameDir, "list.txt"), `${list}\nfile '${frames.at(-1)?.file ?? ""}'\n`)
const encode = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(frameDir, "list.txt"),
    "-vf",
    `fps=${FPS},scale=${VIEWPORT.w * 2}:${VIEWPORT.h * 2}:flags=lanczos,format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "16",
    "-movflags",
    "+faststart",
    join(here, "public", `rec-${NAME}.mp4`),
  ],
  { stdio: "inherit" },
)
if (encode.status !== 0) throw new Error("ffmpeg failed")

// Scene and event times are relative to the first captured frame, which is t=0 in the video.
const shift = (t: number): number => Math.max(0, t - firstFrame)
writeFileSync(
  join(here, "public", `timeline-${NAME}.json`),
  JSON.stringify(
    {
      video: `rec-${NAME}.mp4`,
      duration: shift(captureEnd),
      viewport: VIEWPORT,
      url: new URL(APP_URL).host,
      events: events.map((event) => ({ ...event, t: shift(event.t) })),
      scenes: scenes.map((item) => ({ ...item, start: shift(item.start), end: shift(item.end) })),
    },
    null,
    2,
  ),
)
console.log(
  `✔ ${frames.length} frames · ${scenes.length} scenes → public/rec-${NAME}.mp4, public/timeline-${NAME}.json`,
)
