// @vitest-environment node

import type { ChildProcess, spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ApplePaddleVlmServer,
  paddleVlmServerEnvironment,
  readWslVllmRuntime,
  WslPaddleVlmServer,
  wslVllmRuntimeConfigPath,
} from "../../src/electron/paddleVlmServer"

describe("Paddle MLX-VLM server", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("assembles an offline launch environment without inherited credential or proxy canaries", () => {
    vi.stubEnv("HOME", "/caller/home")
    vi.stubEnv("OPENAI_API_KEY", "canary-secret")
    vi.stubEnv("OAUTH_ACCESS_TOKEN", "canary-secret")
    vi.stubEnv("HTTPS_PROXY", "canary-secret")
    vi.stubEnv("CODEX_AUTH_TOKEN", "canary-secret")

    const environment = paddleVlmServerEnvironment("/runtime/home", "local-api-key")

    expect(environment).toMatchObject({
      HOME: "/caller/home",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_HOME: join("/runtime/home", ".cache", "huggingface"),
      NO_PROXY: "127.0.0.1,localhost",
      MLX_VLM_SERVER_API_KEY: "local-api-key",
    })
    expect(environment).not.toHaveProperty("OPENAI_API_KEY")
    expect(environment).not.toHaveProperty("OAUTH_ACCESS_TOKEN")
    expect(environment).not.toHaveProperty("HTTPS_PROXY")
    expect(environment).not.toHaveProperty("CODEX_AUTH_TOKEN")
  })

  it("offers no acceleration away from Apple silicon", async () => {
    const server = new ApplePaddleVlmServer({ platform: "linux", arch: "x64" })

    await expect(server.acceleration()).resolves.toBeNull()
    await expect(server.launch()).resolves.toBeNull()
  })
})

describe("Paddle vLLM server in WSL", () => {
  let home = ""

  afterEach(async () => {
    vi.unstubAllGlobals()
    if (home) await rm(home, { recursive: true, force: true })
    home = ""
  })

  async function installRuntime(config: unknown): Promise<void> {
    home = await mkdtemp(join(tmpdir(), "paddle-vllm-test-"))
    await mkdir(join(home, ".ohmypaper"), { recursive: true })
    await writeFile(wslVllmRuntimeConfigPath(home), JSON.stringify(config), "utf8")
  }

  it("reads only a complete runtime description", async () => {
    await installRuntime({ version: 1, distro: "Ubuntu", root: "/home/me/.ohmypaper/paddle-vllm" })
    await expect(readWslVllmRuntime(home)).resolves.toEqual({
      version: 1,
      distro: "Ubuntu",
      root: "/home/me/.ohmypaper/paddle-vllm",
    })

    await writeFile(wslVllmRuntimeConfigPath(home), '{"version":1,"distro":"Ubuntu"}', "utf8")
    await expect(readWslVllmRuntime(home)).resolves.toBeNull()
    await rm(wslVllmRuntimeConfigPath(home))
    await expect(readWslVllmRuntime(home)).resolves.toBeNull()
  })

  it("is only offered on Windows", async () => {
    await installRuntime({ version: 1, distro: "Ubuntu", root: "/home/me/.ohmypaper/paddle-vllm" })

    await expect(new WslPaddleVlmServer({ home, platform: "win32" }).acceleration()).resolves.toBe(
      "vllm",
    )
    await expect(
      new WslPaddleVlmServer({ home, platform: "darwin" }).acceleration(),
    ).resolves.toBeNull()
  })

  it("starts serve.sh in the configured distribution and hands it the API key on stdin", async () => {
    await installRuntime({ version: 1, distro: "Ubuntu", root: "/home/me/.ohmypaper/paddle-vllm" })
    const stdin = new PassThrough()
    const written: string[] = []
    stdin.on("data", (chunk: Buffer) => written.push(chunk.toString("utf8")))
    const child = Object.assign(new EventEmitter(), {
      stdin,
      stderr: new PassThrough(),
      pid: 4242,
      exitCode: null,
      kill: vi.fn(),
    })
    const spawnProcess = vi.fn(() => child as unknown as ChildProcess)
    const fetchModels = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchModels)
    const server = new WslPaddleVlmServer({
      home,
      platform: "win32",
      spawnProcess: spawnProcess as unknown as typeof spawn,
    })

    const launch = await server.launch()
    await launch?.ready

    expect(spawnProcess).toHaveBeenCalledOnce()
    const [command, args] = spawnProcess.mock.calls[0] as unknown as [string, string[]]
    expect(command).toBe("wsl.exe")
    expect(args.slice(0, 5)).toEqual([
      "-d",
      "Ubuntu",
      "--",
      "bash",
      "/home/me/.ohmypaper/paddle-vllm/serve.sh",
    ])
    const port = Number(args[5])
    expect(launch?.connection).toMatchObject({
      backend: "vllm-server",
      serverUrl: `http://127.0.0.1:${port}/v1`,
      model: "PaddleOCR-VL-1.6-0.9B",
    })
    expect(written.join("")).toBe(`${launch?.connection.apiKey}\n`)
    expect(fetchModels).toHaveBeenCalledWith(`http://127.0.0.1:${port}/v1/models`, {
      headers: { authorization: `Bearer ${launch?.connection.apiKey}` },
      signal: expect.any(AbortSignal),
    })
    await expect(server.launch()).resolves.toBe(launch)

    server.stop()
    expect(stdin.writableEnded).toBe(true)
  })

  it("waits for a stopped server to exit before starting the next one", async () => {
    await installRuntime({ version: 1, distro: "Ubuntu", root: "/home/me/.ohmypaper/paddle-vllm" })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    )
    const children: (EventEmitter & { exitCode: number | null })[] = []
    const spawnProcess = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stderr: new PassThrough(),
        pid: 4242,
        exitCode: null as number | null,
        kill: vi.fn(),
      })
      children.push(child)
      return child as unknown as ChildProcess
    })
    const server = new WslPaddleVlmServer({
      home,
      platform: "win32",
      spawnProcess: spawnProcess as unknown as typeof spawn,
    })
    await (await server.launch())?.ready

    server.stop()
    const relaunch = server.launch()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(spawnProcess).toHaveBeenCalledOnce()
    const previous = children[0]
    if (previous) {
      previous.exitCode = 0
      previous.emit("exit", 0)
    }
    await (await relaunch)?.ready

    expect(spawnProcess).toHaveBeenCalledTimes(2)
    server.stop()
  })

  it("gives up at once when wsl.exe cannot be started", async () => {
    await installRuntime({ version: 1, distro: "Ubuntu", root: "/home/me/.ohmypaper/paddle-vllm" })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stderr: new PassThrough(),
      pid: undefined,
      exitCode: null,
      kill: vi.fn(),
    })
    const server = new WslPaddleVlmServer({
      home,
      platform: "win32",
      spawnProcess: vi.fn(() => {
        queueMicrotask(() => child.emit("error", new Error("spawn wsl.exe ENOENT")))
        return child as unknown as ChildProcess
      }) as unknown as typeof spawn,
    })

    const launch = await server.launch()

    await expect(launch?.ready).rejects.toMatchObject({ reason: "process" })
  })
})
