// @vitest-environment node

import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("MinerU runtime setup", () => {
  it("pins the pdftext API version required by MinerU 3.4 Hybrid", async () => {
    const setup = await readFile("scripts/setup-mineru-runtime.mjs", "utf8")
    expect(setup).toContain('"pdftext==0.6.3"')
  })
})
