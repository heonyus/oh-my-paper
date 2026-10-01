import { describe, expect, it } from "vitest"
import { infographicDocument, infographicHtml } from "../../src/renderer/lib/infographicHtml"

describe("infographicHtml", () => {
  it("keeps a markup body and drops a code fence around it", () => {
    expect(infographicHtml('```html\n<div class="flow">A → B</div>\n```')).toBe(
      '<div class="flow">A → B</div>',
    )
  })

  it("leaves Markdown figure analyses to the Markdown renderer", () => {
    expect(infographicHtml("## 한눈에 보는 결론\n\n- 정확도 상승")).toBeNull()
  })

  it("strips scripts, event handlers and links", () => {
    const html = infographicHtml(
      '<div onclick="x()"><script>alert(1)</script><a href="https://e.x">l</a><img src="https://e.x/p.png"></div>',
    )
    expect(html).not.toMatch(/script|onclick|href|src=/u)
  })
})

describe("infographicDocument", () => {
  it("blocks network loads and maps app colors onto the variables the prompt names", () => {
    const style = { getPropertyValue: (name: string) => (name === "--focus" ? "#35765b" : "") }
    const doc = infographicDocument("<div></div>", style as unknown as CSSStyleDeclaration)
    expect(doc).toContain("default-src 'none'")
    expect(doc).toContain("--accent:#35765b;")
  })
})
