// Shown in place of a dead link when oh-my-paper is chosen while the local
// server is stopped. It keeps asking the background worker, which sends the
// paper's tab on and closes this page once the server answers.

const query = new URLSearchParams(location.search)
const tabId = Number(query.get("tab"))
const url = query.get("url")

document.documentElement.lang = chrome.i18n.getMessage("lang")
for (const node of document.querySelectorAll("[data-message]")) {
  node.textContent = chrome.i18n.getMessage(node.dataset.message)
}
document.title = chrome.i18n.getMessage("stopped")

setInterval(() => void chrome.runtime.sendMessage({ type: "oh-my-paper:resume", tabId, url }), 2000)
