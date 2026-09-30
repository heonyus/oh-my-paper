import { describe, expect, it } from "vitest"
import { backgroundCommand } from "../../src/electron/backgroundPriority"

describe("background engine priority", () => {
  it("runs the engine at utility QoS on macOS", () => {
    expect(backgroundCommand("/py", ["-m", "mlx_vlm.server"], "darwin", () => true)).toEqual([
      "/usr/sbin/taskpolicy",
      ["-c", "utility", "/py", "-m", "mlx_vlm.server"],
    ])
  })

  it("leaves the command alone elsewhere or without taskpolicy", () => {
    expect(backgroundCommand("/py", ["worker.py"], "win32", () => true)).toEqual([
      "/py",
      ["worker.py"],
    ])
    expect(backgroundCommand("/py", ["worker.py"], "darwin", () => false)).toEqual([
      "/py",
      ["worker.py"],
    ])
  })
})
