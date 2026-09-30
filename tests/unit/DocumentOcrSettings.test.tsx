import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DocumentOcrSettings } from "../../src/renderer/components/DocumentOcrSettings"
import type { DocumentOcrProviderStatus } from "../../src/shared/documentOcr"

const missing: DocumentOcrProviderStatus = {
  configured: false,
  provider: "paddle",
  model: "PaddleOCR-VL-1.6",
  acceleration: null,
}

describe("DocumentOcrSettings", () => {
  it("asks for the local runtime when nothing is installing", () => {
    render(<DocumentOcrSettings status={missing} />)
    expect(screen.getByText("로컬 런타임 설치 필요")).toBeVisible()
  })

  it("says a background install will switch the engine on by itself", () => {
    render(<DocumentOcrSettings status={{ ...missing, installing: true }} />)
    expect(screen.getByText("설치 중 · 끝나면 자동으로 켜집니다")).toBeVisible()
  })
})
