// @vitest-environment node

import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("PaddleOCR-VL runtime setup", () => {
  it("pins the full parser runtime and writes the readiness marker", async () => {
    const setup = await readFile("scripts/setup-paddle-vl-runtime.mjs", "utf8")

    expect(setup).toContain('"paddlepaddle==3.2.1"')
    expect(setup).toContain('"paddleocr[doc-parser]==3.7.0"')
    expect(setup).toContain('".ready-v1.6-layout-v2"')
    expect(setup).toContain('"PP-DocLayoutV3"')
    expect(setup).toContain('"mlx-vlm==0.6.17"')
    expect(setup).toContain('"jinja2==3.1.6"')
    expect(setup).toContain('".ready-mlx-v1.6"')
    expect(setup).toContain('"PaddlePaddle/PaddleOCR-VL-1.6"')
  })
})
