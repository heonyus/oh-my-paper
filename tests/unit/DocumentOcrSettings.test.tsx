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
    expect(screen.getByText("설치 중")).toBeVisible()
    expect(screen.getByText(/설치가 끝나면 자동으로 켜집니다/)).toBeVisible()
  })

  it("shows how far the install is and how long is left", () => {
    render(
      <DocumentOcrSettings
        status={{ ...missing, installing: true, installProgress: { percent: 42, etaSeconds: 150 } }}
      />,
    )
    expect(screen.getByText("설치 중 42% · 약 3분 남음")).toBeVisible()
    expect(screen.getByRole("progressbar", { name: "OCR 엔진 설치 진행률" })).toHaveAttribute(
      "value",
      "42",
    )
  })
  it("tells whoever looks how many papers are analysed", () => {
    render(
      <DocumentOcrSettings
        status={{ ...missing, configured: true, acceleration: "mlx" }}
        analysis={{ analysed: 2, total: 3 }}
      />,
    )
    expect(screen.getByText("논문 3편 중 2편 완료")).toBeVisible()
  })

  it("leaves the count out of an empty library", () => {
    render(<DocumentOcrSettings status={missing} analysis={{ analysed: 0, total: 0 }} />)
    expect(screen.queryByText(/편 완료/)).toBeNull()
  })
})
