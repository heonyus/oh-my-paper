// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalInferenceService } from "../../../src/electron/localInferenceService"
import { registerLocalInferenceIpc } from "../../../src/electron/registerLocalInferenceIpc"
import {
  localInferenceChannels,
  localInferenceSetupCheckSchema,
} from "../../../src/shared/localInference"

type Handler = (event: unknown, value: unknown) => unknown

const ipc = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    main: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler)
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel)
      },
    },
  }
})

vi.mock("electron", () => ({ ipcMain: ipc.main }))

afterEach(() => {
  ipc.handlers.clear()
})

function service(): LocalInferenceService {
  return new LocalInferenceService({
    checkSetup: async () =>
      localInferenceSetupCheckSchema.parse({
        status: "unavailable",
        reason: "setup_required",
        message: "setup required",
      }),
    engine: { complete: vi.fn(), cancel: vi.fn(), dispose: vi.fn() },
  })
}

describe("local inference IPC mount", () => {
  it("validates requests and unregisters every handler safely", async () => {
    const dispose = registerLocalInferenceIpc(service())
    expect(ipc.handlers.size).toBe(Object.values(localInferenceChannels).length)
    const handler = ipc.handlers.get(localInferenceChannels.enable)
    if (!handler) throw new Error("local inference enable handler was not registered")

    await expect(handler({}, { enabled: "yes" })).rejects.toThrow()
    dispose()
    dispose()
    expect(ipc.handlers.size).toBe(0)
  })
})
