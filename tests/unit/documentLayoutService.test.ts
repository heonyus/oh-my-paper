import { describe, expect, it } from "vitest"
import { layoutRuntimePython, layoutScriptPath } from "../../src/electron/documentLayoutService"

describe("document layout service paths", () => {
  it("resolves the managed macOS runtime", () => {
    expect(layoutRuntimePython("/Users/test", "darwin")).toBe(
      "/Users/test/.scourgify/layout-runtime/bin/python",
    )
  })

  it("resolves the managed Windows runtime", () => {
    expect(layoutRuntimePython("C:\\Users\\test", "win32")).toContain(
      ".scourgify/layout-runtime/Scripts/python.exe",
    )
  })

  it("honors an explicit runtime and packaged script path", () => {
    expect(layoutRuntimePython("/home/test", "linux", "/custom/python")).toBe("/custom/python")
    expect(layoutScriptPath("/repo", "/Applications/App/Resources", true)).toBe(
      "/Applications/App/Resources/layout/pp_structure_layout.py",
    )
  })
})
