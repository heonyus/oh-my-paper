import { describe, expect, it } from "vitest"
import {
  AccountTransportError,
  parseAccountClientConfig,
  readBoundedResponseText,
} from "../../../src/electron/accountTransport"

describe("account transport boundary", () => {
  it("requires exact HTTPS service and issuer origins", () => {
    const valid = {
      serviceOrigin: "https://account.example.test",
      issuer: "https://account.example.test",
      googleClientId: "desktop.apps.googleusercontent.com",
    }
    expect(parseAccountClientConfig(valid)).toEqual(valid)
    expect(() =>
      parseAccountClientConfig({ ...valid, serviceOrigin: "http://127.0.0.1:8789" }),
    ).toThrow()
    expect(() =>
      parseAccountClientConfig({ ...valid, issuer: "https://account.example.test/path" }),
    ).toThrow()
  })

  it("stops reading a response as soon as its byte cap is exceeded", async () => {
    let yielded = 0
    async function* body(): AsyncGenerator<Uint8Array> {
      yielded += 1
      yield new Uint8Array(4)
      yielded += 1
      yield new Uint8Array(4)
      yielded += 1
      yield new Uint8Array(4)
    }

    await expect(readBoundedResponseText(body(), 6)).rejects.toEqual(
      new AccountTransportError("invalid_response"),
    )
    expect(yielded).toBe(2)
  })
})
