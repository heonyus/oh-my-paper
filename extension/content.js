// Offers the choice for paper links on supported sites: a plain left click
// shows it beside the link instead of following it. Modified clicks
// (Cmd/Ctrl/Shift/Alt) are left alone so the site still opens normally.

function isPaperLink(anchor) {
  let url
  try {
    url = new URL(anchor.href)
  } catch {
    return false
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false
  const host = url.hostname.replace(/^www\./, "")
  const path = url.pathname

  if (/\.pdf$/i.test(path)) return true

  switch (host) {
    case "arxiv.org":
      return /^\/(?:abs|pdf|html)\/[^/]+/.test(path)
    case "openreview.net":
      return Boolean(url.searchParams.get("id")) && /^\/(?:forum|pdf|notes?)$/.test(path)
    case "aclanthology.org":
      return /^\/(?:\d{4}\.|[A-Z]\d{2}-)[^/]+\/?$/.test(path)
    case "semanticscholar.org":
      return /^\/paper\//.test(path)
    default:
      return false
  }
}

// The link chosen to open here, let through once when its click is replayed.
let passing = null

document.addEventListener(
  "click",
  (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (!anchor || !isPaperLink(anchor)) return
    if (anchor === passing) {
      passing = null
      return
    }
    event.preventDefault()
    event.stopPropagation()
    globalThis.ohMyPaperChooser.forLink(anchor, () => {
      passing = anchor
      anchor.click()
    })
  },
  true,
)
