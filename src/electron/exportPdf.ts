import { Buffer } from "node:buffer"
import { randomUUID } from "node:crypto"
import type { BrowserWindow as ElectronBrowserWindow } from "electron"
import { renderToString } from "katex"
import { z } from "zod"
import { EXPORT_LIMITS, type ExportFile, exportFileSchema } from "../shared/exportSchemas"
import type { MathImageRenderer, RenderedMathImage } from "./exportDocx"
import { buildExportHtml } from "./exportHtml"
import { exportFilenameBase } from "./exportMarkdown"
import type { ExportSnapshot } from "./exportSnapshot"

const readyStateSchema = z.object({ incompleteImages: z.number().int().nonnegative() })
const boundsSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive().max(2_000),
  height: z.number().int().positive().max(2_000),
})
const MAX_HTML_BYTES = EXPORT_LIMITS.totalAssetBytes * 2
const MAX_PDF_BYTES = 100 * 1024 * 1024

export interface PdfRenderer {
  printToPdf(html: string, signal: AbortSignal): Promise<Uint8Array>
}

export class ExportRenderTimeoutError extends Error {
  readonly name = "ExportRenderTimeoutError"
  constructor(readonly timeoutMs: number) {
    super(`Export rendering exceeded ${timeoutMs} ms`)
  }
}

export class ExportCancelledError extends Error {
  readonly name = "ExportCancelledError"
  constructor() {
    super("Export rendering was cancelled")
  }
}

export class ExportRenderError extends Error {
  readonly name = "ExportRenderError"
  constructor(
    readonly kind: "html_too_large" | "assets_incomplete" | "invalid_pdf" | "pdf_too_large",
    options?: ErrorOptions,
  ) {
    super(kind, options)
  }
}

async function readyWindow(
  html: string,
  signal: AbortSignal,
  dimensions: { readonly width: number; readonly height: number },
): Promise<ElectronBrowserWindow> {
  const byteLength = Buffer.byteLength(html)
  if (byteLength > MAX_HTML_BYTES) throw new ExportRenderError("html_too_large")
  if (signal.aborted) throw new ExportCancelledError()
  const { BrowserWindow, session } = await import("electron")
  const isolatedSession = session.fromPartition(`scourgify-export-${randomUUID()}`, {
    cache: false,
  })
  isolatedSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "file://*/*", "ftp://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  )
  const window = new BrowserWindow({
    show: false,
    width: dimensions.width,
    height: dimensions.height,
    webPreferences: {
      contextIsolation: true,
      javascript: true,
      nodeIntegration: false,
      sandbox: true,
      session: isolatedSession,
      webSecurity: true,
      backgroundThrottling: false,
    },
  })
  const destroy = () => {
    if (!window.isDestroyed()) window.destroy()
  }
  signal.addEventListener("abort", destroy, { once: true })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  window.once("closed", () => {
    signal.removeEventListener("abort", destroy)
    isolatedSession.webRequest.onBeforeRequest(null)
  })
  try {
    await window.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`)
    const state = readyStateSchema.parse(
      await window.webContents.executeJavaScript(
        "(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(async image=>{if(image.complete)return;await new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true})})}));return{incompleteImages:Array.from(document.images).filter(image=>!image.complete||image.naturalWidth===0).length}})()",
        true,
      ),
    )
    if (state.incompleteImages > 0) throw new ExportRenderError("assets_incomplete")
    return window
  } catch (error) {
    destroy()
    throw error
  }
}

function mathCaptureHtml(latex: string): string {
  const math = renderToString(latex, {
    displayMode: true,
    output: "mathml",
    strict: false,
    throwOnError: false,
    trust: false,
  })
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><style>html,body{margin:0;background:transparent}#math{display:inline-block;padding:12px;color:#000;font:24px system-ui,sans-serif}</style></head><body><div id="math">${math}</div></body></html>`
}

export class ElectronExportRenderer implements PdfRenderer {
  async printToPdf(html: string, signal: AbortSignal): Promise<Uint8Array> {
    const window = await readyWindow(html, signal, { width: 1_200, height: 900 })
    try {
      const bytes = await window.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      })
      return bytes
    } finally {
      if (!window.isDestroyed()) window.destroy()
    }
  }

  readonly renderMath: MathImageRenderer = async (latex): Promise<RenderedMathImage> => {
    const signal = AbortSignal.timeout(15_000)
    const window = await readyWindow(mathCaptureHtml(latex), signal, { width: 1_200, height: 300 })
    try {
      const bounds = boundsSchema.parse(
        await window.webContents.executeJavaScript(
          "(()=>{const box=document.getElementById('math')?.getBoundingClientRect();return box?{x:Math.max(0,Math.floor(box.x)),y:Math.max(0,Math.floor(box.y)),width:Math.ceil(box.width),height:Math.ceil(box.height)}:null})()",
          true,
        ),
      )
      const image = await window.webContents.capturePage(bounds)
      return {
        bytes: image.toPNG(),
        mediaType: "image/png",
        width: bounds.width,
        height: bounds.height,
        altText: `LaTeX: ${latex}`,
      }
    } finally {
      if (!window.isDestroyed()) window.destroy()
    }
  }
}

async function renderBounded(
  renderer: PdfRenderer,
  html: string,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Uint8Array> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 120_000) {
    throw new RangeError("PDF timeout must be an integer from 10 to 120000 ms")
  }
  if (externalSignal?.aborted) throw new ExportCancelledError()
  const controller = new AbortController()
  let cancel: (() => void) | undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      controller.abort()
      reject(new ExportCancelledError())
    }
    externalSignal?.addEventListener("abort", cancel, { once: true })
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ExportRenderTimeoutError(timeoutMs))
    }, timeoutMs)
  })
  try {
    return await Promise.race([renderer.printToPdf(html, controller.signal), timeout, cancelled])
  } finally {
    if (timer) clearTimeout(timer)
    if (cancel) externalSignal?.removeEventListener("abort", cancel)
  }
}

export async function exportPdf(
  snapshot: ExportSnapshot,
  options: {
    readonly renderer?: PdfRenderer
    readonly timeoutMs?: number
    readonly signal?: AbortSignal
  } = {},
): Promise<ExportFile> {
  const bytes = await renderBounded(
    options.renderer ?? new ElectronExportRenderer(),
    buildExportHtml(snapshot),
    options.timeoutMs ?? 30_000,
    options.signal,
  )
  if (bytes.byteLength > MAX_PDF_BYTES) throw new ExportRenderError("pdf_too_large")
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new ExportRenderError("invalid_pdf")
  }
  return exportFileSchema.parse({
    relativePath: `${exportFilenameBase(snapshot.title)}.pdf`,
    mediaType: "application/pdf",
    bytes,
  })
}
