// Local oh-my-paper server origin. Must match OH_MY_PAPER_WEB_PORT (default 8788).
const APP_ORIGIN = "http://127.0.0.1:8788"

// Resolves a paper landing-page URL to a direct PDF URL when the rule is
// local and deterministic. Returns null when server-side resolution is needed
// (e.g. Semantic Scholar's openAccessPdf lookup).
function resolvePdfUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, "")
  const path = url.pathname

  if (host === "arxiv.org") {
    const landing = path.match(/^\/(?:abs|html)\/([^/]+?)\/?$/)
    if (landing) return `https://arxiv.org/pdf/${landing[1]}`
    if (/^\/pdf\//.test(path)) return url.toString()
    return null
  }
  if (host === "openreview.net") {
    const id = url.searchParams.get("id")
    if (path === "/forum" && id) return `https://openreview.net/pdf?id=${id}`
    if (path === "/pdf" && id) return url.toString()
    return null
  }
  if (host === "aclanthology.org") {
    const paper = path.match(/^\/((?:\d{4}\.|[A-Z]\d{2}-)[^/]+)\/?$/)?.[1]
    if (paper && !paper.endsWith(".pdf")) return `https://aclanthology.org/${paper}.pdf`
    if (/\.pdf$/i.test(path)) return url.toString()
    return null
  }
  if (/\.pdf$/i.test(path)) return url.toString()
  return null
}

function isPdfBytes(bytes) {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
}

function fileNameFor(pdfUrl) {
  const segment = decodeURIComponent(pdfUrl.pathname.split("/").filter(Boolean).at(-1) ?? "paper")
  const name = segment.replace(/[^a-zA-Z0-9._-]/g, "_") || "paper"
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`
}

// Downloads the PDF inside the user's browser session — cookies and challenge
// clearance apply — then uploads the bytes to the local server and navigates
// the tab to the imported document.
async function openPaper(pdfUrl, tabId) {
  const openDocument = (id) =>
    chrome.tabs.update(tabId, { url: id ? `${APP_ORIGIN}/?doc=${id}` : `${APP_ORIGIN}/` })
  try {
    const response = await fetch(pdfUrl, {
      headers: { accept: "application/pdf,*/*;q=0.8" },
      redirect: "follow",
      credentials: "include",
    })
    if (!response.ok) throw new Error(`pdf_${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!isPdfBytes(bytes)) throw new Error("not_pdf")
    const upload = await fetch(
      `${APP_ORIGIN}/api/documents?name=${encodeURIComponent(fileNameFor(new URL(pdfUrl)))}`,
      { method: "POST", headers: { "content-type": "application/pdf" }, body: bytes },
    )
    if (!upload.ok) throw new Error(`upload_${upload.status}`)
    const result = await upload.json()
    await openDocument(result?.document?.id ?? null)
  } catch {
    // Fall back to the server-side importer so the user still gets a clear
    // progress/error page instead of a silent failure.
    await chrome.tabs.update(tabId, {
      url: `${APP_ORIGIN}/open?url=${encodeURIComponent(pdfUrl)}`,
    })
  }
}

// Whether the local server answers at all; a stopped one refuses the
// connection. The toolbar button carries the answer, so a paper that opened in
// the browser's own viewer is explained.
async function appRunning() {
  let running = true
  try {
    await fetch(`${APP_ORIGIN}/`, { method: "HEAD", signal: AbortSignal.timeout(1500) })
  } catch {
    running = false
  }
  void chrome.action.setBadgeText({ text: running ? "" : "off" })
  void chrome.action.setTitle({
    title: chrome.i18n.getMessage(running ? "actionTitle" : "stopped"),
  })
  return running
}

// Beside the tab, a page that says how to start the app; it hands the tab back
// once the server answers, with the link that was chosen, if one was.
async function showStopped(tab, url) {
  const query = new URLSearchParams({ tab: String(tab.id) })
  if (url) query.set("url", url)
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`stopped.html?${query}`),
    index: tab.index + 1,
  })
}

// A link chosen in the chooser on a paper site.
async function openLink(url, tabId) {
  if (!(await appRunning())) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    return tab ? showStopped(tab, url) : undefined
  }
  const pdfUrl = resolvePdfUrl(url)
  if (pdfUrl) return openPaper(pdfUrl, tabId)
  // Landing pages that need API resolution go through the server importer.
  return chrome.tabs.update(tabId, {
    url: `${APP_ORIGIN}/open?url=${encodeURIComponent(url)}`,
  })
}

// The PDF behind the page in a tab: the tab's own address when it is showing
// one, else the link scholarly sites publish for indexers.
async function pdfInPage(tabId, tabUrl) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () =>
        document.contentType === "application/pdf"
          ? location.href
          : (document.querySelector('meta[name="citation_pdf_url"]')?.content ?? null),
    })
    return injection?.result ? new URL(injection.result, tabUrl).toString() : null
  } catch {
    // Browser pages and the extension store refuse scripts.
    return null
  }
}

function isSemanticScholarPaper(url) {
  const { hostname, pathname } = new URL(url)
  return hostname.replace(/^www\./, "") === "semanticscholar.org" && pathname.startsWith("/paper/")
}

// The toolbar button, and the button on a PDF tab: the paper in the tab opens
// in the reader in its place. A page that is not a paper keeps its tab and
// the reader opens beside it.
async function sendTab(tab) {
  const url = tab.url ?? ""
  if (tab.id === undefined || url.startsWith(APP_ORIGIN)) return
  if (!(await appRunning())) return showStopped(tab)
  if (/^https?:/.test(url)) {
    const pdfUrl = resolvePdfUrl(url) ?? (await pdfInPage(tab.id, url))
    if (pdfUrl) return openPaper(pdfUrl, tab.id)
    if (isSemanticScholarPaper(url)) return openLink(url, tab.id)
  }
  await chrome.tabs.create({ url: `${APP_ORIGIN}/`, index: tab.index + 1 })
}

// The "not running" page asks every couple of seconds; once the server
// answers, the tab the button was pressed on carries on and the page closes.
async function resume(tabId, url, noticeTabId) {
  if (!(await appRunning())) return
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (noticeTabId !== undefined) {
    if (tab) await chrome.tabs.remove(noticeTabId)
    else await chrome.tabs.update(noticeTabId, { url: `${APP_ORIGIN}/` })
  }
  if (!tab) return
  await chrome.tabs.update(tabId, { active: true })
  await (url ? openLink(url, tabId) : sendTab(tab))
}

chrome.action.onClicked.addListener((tab) => void sendTab(tab))

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "oh-my-paper:open" && typeof message.url === "string") {
    void openLink(message.url, sender.tab?.id ?? -1)
  }
  if (message?.type === "oh-my-paper:send-tab" && sender.tab) void sendTab(sender.tab)
  if (message?.type === "oh-my-paper:resume" && Number.isInteger(message.tabId)) {
    void resume(message.tabId, typeof message.url === "string" ? message.url : null, sender.tab?.id)
  }
})

// Tabs that received a PDF and have not finished loading it.
const pdfTabs = new Set()

// A top-level navigation that serves a PDF stays in the browser's viewer; once
// it has loaded, a corner button offers to open it in oh-my-paper.
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.url.startsWith(APP_ORIGIN)) return
    const contentType =
      (details.responseHeaders ?? [])
        .find((header) => header.name.toLowerCase() === "content-type")
        ?.value?.toLowerCase() ?? ""
    if (contentType.includes("application/pdf")) pdfTabs.add(details.tabId)
    else pdfTabs.delete(details.tabId)
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"],
)

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== "complete" || !pdfTabs.delete(tabId)) return
  void offerPdf(tabId)
})

chrome.tabs.onRemoved.addListener((tabId) => pdfTabs.delete(tabId))

async function offerPdf(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["chooser.js"] })
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => globalThis.ohMyPaperChooser.forPdf(),
    })
  } catch {
    // The tab moved on, or shows a page extensions may not touch.
  }
}
