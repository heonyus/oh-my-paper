import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { launchSimulatedAuthenticatedApplication } from "../support/electron/launchSimulatedAuthenticatedApplication"

test("citation cards reflow without clipping across the sidebar range", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ohmypaper-citation-e2e-"))
  const qa = await launchSimulatedAuthenticatedApplication({
    userDataRoot: join(temporaryRoot, "user-data"),
  })
  try {
    const page = await qa.application.firstWindow()
    await page.waitForSelector(".app-shell")
    const layout = await page.evaluate(() => {
      const host = document.createElement("section")
      host.className = "citation-panel"
      host.style.cssText = "position:fixed;left:-1000px;top:0;width:260px"
      const list = document.createElement("div")
      list.className = "citation-list"
      const item = document.createElement("article")
      item.className = "citation-item"
      const header = document.createElement("header")
      const key = document.createElement("span")
      key.className = "citation-key"
      key.textContent = "[httpsopenreviewnetforumidlpffptbi9s-2024]"
      const details = document.createElement("div")
      const title = document.createElement("strong")
      title.textContent = "A long cited paper title that must remain readable"
      const authors = document.createElement("span")
      authors.textContent = "A long author and source URL that must wrap inside the card"
      details.append(title, authors)
      header.append(key, details)
      item.append(header)
      list.append(item)
      host.append(list)
      document.body.append(host)
      const measure = () => {
        const overflow =
          item.getBoundingClientRect().right - (list.getBoundingClientRect().right - 10)
        return {
          overflow,
          detailsBelowKey:
            details.getBoundingClientRect().top >= key.getBoundingClientRect().bottom - 0.5,
        }
      }
      const narrow = measure()
      host.style.width = "520px"
      const wide = measure()
      host.remove()
      return { narrow, wide }
    })

    expect(layout.narrow.overflow).toBeLessThanOrEqual(0.5)
    expect(layout.narrow.detailsBelowKey).toBe(true)
    expect(layout.wide.overflow).toBeLessThanOrEqual(0.5)
    expect(layout.wide.detailsBelowKey).toBe(false)
  } finally {
    await qa.close()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
