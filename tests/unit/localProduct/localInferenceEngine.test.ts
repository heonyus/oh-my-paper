// @vitest-environment node

import { spawn } from "node:child_process"
import { once } from "node:events"
import { Readable } from "node:stream"
import { describe, expect, it } from "vitest"
import {
  buildLocalInferenceEnvironment,
  parseLlamaCppCompletion,
  readBoundedLlamaCppBody,
  waitForLlamaCppPort,
} from "../../../src/electron/localInferenceEngine"

describe("llama.cpp engine boundaries", () => {
  it("passes only the documented locale and process paths to the child", () => {
    expect(
      buildLocalInferenceEnvironment({
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        PATH: "/usr/bin",
        TMPDIR: "/tmp/ohmypaper",
        HOME: "/Users/private",
        OPENAI_API_KEY: "secret",
      }),
    ).toEqual({
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      PATH: "/usr/bin",
      TMPDIR: "/tmp/ohmypaper",
    })
  })

  it("accepts protocol metadata alongside completion content", () => {
    expect(
      parseLlamaCppCompletion({ content: "local result", stop: true, tokens_predicted: 3 }),
    ).toBe("local result")
  })

  it("discovers the owned loopback port from stderr", async () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.stderr.write('main: server is listening on http://127.0.0.1:43123\\n'); setInterval(() => {}, 1000)",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    )
    const exited = once(child, "exit")
    try {
      await expect(waitForLlamaCppPort(child, 2_000)).resolves.toBe(43_123)
    } finally {
      child.kill("SIGKILL")
      await exited
    }
  })

  it("force-kills a child that never reports a port before startup timeout", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    const exited = once(child, "exit")

    await expect(waitForLlamaCppPort(child, 50)).rejects.toThrow("startup timed out")
    await exited
    expect(child.signalCode).toBe("SIGKILL")
  })

  it("stops reading before an oversized response can be fully buffered", async () => {
    const body = Readable.from([Buffer.alloc(8), Buffer.alloc(8)])

    await expect(readBoundedLlamaCppBody(body, 8)).rejects.toThrow("exceeded the limit")
    expect(body.destroyed).toBe(true)
  })
})
