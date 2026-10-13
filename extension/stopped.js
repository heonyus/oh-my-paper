// Shown in place of a dead link when the toolbar button is pressed while the
// local server is stopped. It keeps asking the background worker, which sends
// the paper's tab on and closes this page once the server answers.

const tabId = Number(new URLSearchParams(location.search).get("tab"))

document.documentElement.lang = chrome.i18n.getMessage("lang")
for (const node of document.querySelectorAll("[data-message]")) {
  node.textContent = chrome.i18n.getMessage(node.dataset.message)
}
document.title = chrome.i18n.getMessage("stopped")

setInterval(() => void chrome.runtime.sendMessage({ type: "oh-my-paper:resume", tabId }), 2000)
