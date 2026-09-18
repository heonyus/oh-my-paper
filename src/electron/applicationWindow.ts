import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { app, BrowserWindow, shell } from "electron"
import { externalHttpsUrl } from "./externalNavigation"
import { resolveRendererIndex } from "./paths"

export function isApplicationUrl(url: string, directory: string): boolean {
  try {
    const parsed = new URL(url)
    const { VITE_DEV_SERVER_URL: developmentUrl } = process.env
    if (!app.isPackaged && developmentUrl && parsed.origin === new URL(developmentUrl).origin)
      return true
    return (
      parsed.protocol === "file:" &&
      parsed.pathname === new URL(pathToFileURL(resolveRendererIndex(directory)).href).pathname
    )
  } catch {
    return false
  }
}

export function createApplicationWindow(directory: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1536,
    height: 1024,
    minWidth: 920,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 24 },
    backgroundColor: "#f3f5f1",
    webPreferences: {
      preload: join(directory, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    const external = externalHttpsUrl(url)
    if (external) void shell.openExternal(external)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (isApplicationUrl(url, directory)) return
    event.preventDefault()
    const external = externalHttpsUrl(url)
    if (external) void shell.openExternal(external)
  })
  const { VITE_DEV_SERVER_URL: developmentUrl } = process.env
  if (!app.isPackaged && developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(resolveRendererIndex(directory))
  return window
}
