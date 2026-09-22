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

function openLink(url, tabId) {
  const pdfUrl = resolvePdfUrl(url)
  if (pdfUrl) return openPaper(pdfUrl, tabId)
  // Landing pages that need API resolution go through the server importer.
  return chrome.tabs.update(tabId, {
    url: `${APP_ORIGIN}/open?url=${encodeURIComponent(url)}`,
  })
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "oh-my-paper:open" && typeof message.url === "string") {
    void openLink(message.url, sender.tab?.id ?? -1)
  }
})

// Redirects a top-level navigation that serves a PDF into oh-my-paper. The
// download runs in the extension so cookie-gated PDFs still work.
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.url.startsWith(APP_ORIGIN)) return
    const contentType =
      (details.responseHeaders ?? [])
        .find((header) => header.name.toLowerCase() === "content-type")
        ?.value?.toLowerCase() ?? ""
    if (!contentType.includes("application/pdf")) return
    void openPaper(details.url, details.tabId)
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"],
)
