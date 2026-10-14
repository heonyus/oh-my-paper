// The choice offered before a paper leaves the page: open it in oh-my-paper,
// or let the browser open it as it would have. Loaded with the content script
// on the paper sites, and injected into tabs that are showing a PDF.

if (!globalThis.ohMyPaperChooser) {
  const STYLE = `
    :host { all: initial; }
    .card {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      gap: 4px;
      padding: 5px;
      border-radius: 10px;
      background: #fff;
      color: #1d1d1f;
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.08);
      font: 13px/1.2 system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif;
    }
    .chip { right: 16px; bottom: 16px; border-radius: 999px; }
    button {
      all: unset;
      cursor: pointer;
      padding: 8px 12px;
      border-radius: 7px;
      white-space: nowrap;
    }
    .chip button { border-radius: 999px; }
    .primary { background: #1f5f4a; color: #fff; font-weight: 600; }
    .primary:hover { background: #184c3b; }
    .secondary:hover { background: rgb(0 0 0 / 0.06); }
    .dismiss { padding: 8px 10px; opacity: 0.65; }
    button:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) {
      .card {
        background: #26262b;
        color: #f2f2f2;
        box-shadow: 0 8px 28px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.1);
      }
      .secondary:hover { background: rgb(255 255 255 / 0.08); }
    }
  `
  const text = (name) => chrome.i18n.getMessage(name)
  let shown = null

  function close() {
    shown?.remove()
    shown = null
    document.removeEventListener("keydown", onKey, true)
    document.removeEventListener("pointerdown", onPointer, true)
  }

  function onKey(event) {
    if (event.key !== "Escape") return
    event.stopPropagation()
    close()
  }

  function onPointer(event) {
    if (shown && !event.composedPath().includes(shown)) close()
  }

  function button(label, kind, onPress) {
    const element = document.createElement("button")
    element.type = "button"
    element.className = kind
    element.textContent = label
    element.addEventListener("click", (event) => {
      event.stopPropagation()
      onPress()
    })
    return element
  }

  // The tag keeps the page's styles off the card; the closed shadow root keeps its scripts off it.
  function show(card, dismissOnOutside) {
    close()
    const host = document.createElement("oh-my-paper-chooser")
    const root = host.attachShadow({ mode: "closed" })
    const style = document.createElement("style")
    style.textContent = STYLE
    root.append(style, card)
    document.documentElement.append(host)
    shown = host
    document.addEventListener("keydown", onKey, true)
    if (dismissOnOutside) document.addEventListener("pointerdown", onPointer, true)
  }

  globalThis.ohMyPaperChooser = {
    // Beside a link the content script held back; `openHere` lets the click go on as it would have.
    forLink(anchor, openHere) {
      const card = document.createElement("div")
      card.className = "card"
      card.setAttribute("role", "dialog")
      const open = button(text("actionTitle"), "primary", () => {
        close()
        void chrome.runtime.sendMessage({ type: "oh-my-paper:open", url: anchor.href })
      })
      card.append(
        open,
        button(text("openHere"), "secondary", () => {
          close()
          openHere()
        }),
      )
      show(card, true)
      const link = anchor.getBoundingClientRect()
      const size = card.getBoundingClientRect()
      const below = link.bottom + 6
      const top = below + size.height <= innerHeight - 8 ? below : link.top - size.height - 6
      card.style.top = `${Math.max(8, top)}px`
      card.style.left = `${Math.min(Math.max(8, link.left), innerWidth - size.width - 8)}px`
      open.focus({ preventScroll: true })
    },

    // A corner button on a tab showing a PDF; nothing leaves the tab until it is pressed.
    forPdf() {
      if (shown) return
      const chip = document.createElement("div")
      chip.className = "card chip"
      const dismiss = button("✕", "dismiss", close)
      dismiss.setAttribute("aria-label", text("dismiss"))
      chip.append(
        button(text("actionTitle"), "primary", () => {
          close()
          void chrome.runtime.sendMessage({ type: "oh-my-paper:send-tab" })
        }),
        dismiss,
      )
      show(chip, false)
    },
  }
}
