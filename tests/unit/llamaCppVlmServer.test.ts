// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  LlamaCppPaddleVlmServer,
  llamaCppRuntimeConfigPath,
  llamaCppServeArguments,
  type PaddleVlmServer,
  PreferredPaddleVlmServer,
} from "../../src/electron/paddleVlmServer"

describe("llama.cpp recognition server", () => {
  let home = ""

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "ohmypaper-llamacpp-"))
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  async function install(): Promise<void> {
    const root = join(home, ".ohmypaper", "paddle-vl-llamacpp")
    await mkdir(root, { recursive: true })
    for (const name of ["llama-server.exe", "model.gguf", "mmproj.gguf"])
      await writeFile(join(root, name), "")
    await writeFile(
      llamaCppRuntimeConfigPath(home),
      JSON.stringify({
        version: 1,
        server: join(root, "llama-server.exe"),
        model: join(root, "model.gguf"),
        mmproj: join(root, "mmproj.gguf"),
      }),
    )
  }

  it("is the accelerator on Windows once installed, and never elsewhere", async () => {
    expect(await new LlamaCppPaddleVlmServer({ home, platform: "win32" }).acceleration()).toBeNull()
    await install()
    expect(await new LlamaCppPaddleVlmServer({ home, platform: "win32" }).acceleration()).toBe(
      "llamacpp",
    )
    expect(
      await new LlamaCppPaddleVlmServer({ home, platform: "darwin" }).acceleration(),
    ).toBeNull()
  })

  it("serves the model with its projector, Jinja templates and every layer on the GPU", () => {
    const args = llamaCppServeArguments(
      { version: 1, server: "s.exe", model: "m.gguf", mmproj: "p.gguf" },
      9123,
      "key",
    )
    expect(args).toEqual(expect.arrayContaining(["--model", "m.gguf", "--mmproj", "p.gguf"]))
    expect(args).toEqual(expect.arrayContaining(["--port", "9123", "--api-key", "key", "--jinja"]))
    expect(args).toEqual(expect.arrayContaining(["--host", "127.0.0.1", "--n-gpu-layers", "99"]))
  })

  it("prefers the first installed server", async () => {
    const server = (acceleration: "vllm" | "llamacpp" | null): PaddleVlmServer => ({
      acceleration: async () => acceleration,
      launch: async () => null,
      stop: () => undefined,
    })
    expect(
      await new PreferredPaddleVlmServer([server(null), server("llamacpp")]).acceleration(),
    ).toBe("llamacpp")
    expect(
      await new PreferredPaddleVlmServer([server("vllm"), server("llamacpp")]).acceleration(),
    ).toBe("vllm")
    expect(await new PreferredPaddleVlmServer([server(null)]).acceleration()).toBeNull()
  })
})
