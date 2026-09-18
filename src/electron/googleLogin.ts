import { shell } from "electron"
import { request } from "undici"
import { z } from "zod"
import type { AccountSessionGrant } from "../shared/accountSchemas"
import {
  type AccountClientConfig,
  type AccountTransport,
  readBoundedResponseText,
} from "./accountTransport"
import { GoogleLoopbackError, startGoogleLoopback } from "./googleLoopback"

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const tokenResponseSchema = z.object({ id_token: z.string().min(64).max(8_192) }).passthrough()

export class GoogleLoginError extends Error {
  readonly name = "GoogleLoginError"
  constructor(readonly kind: "already_pending" | "cancelled" | "failed" | "timeout") {
    super(kind)
  }
}

type GoogleLoginDependencies = {
  readonly openExternal?: (url: string) => Promise<void>
  readonly exchangeCode?: (input: {
    readonly clientId: string
    readonly code: string
    readonly codeVerifier: string
    readonly redirectUri: string
    readonly signal: AbortSignal
  }) => Promise<string>
  readonly timeoutMs?: number
}

export class GoogleLogin {
  #active: AbortController | null = null

  constructor(
    private readonly config: AccountClientConfig,
    private readonly accountTransport: AccountTransport,
    private readonly dependencies: GoogleLoginDependencies = {},
  ) {}

  async login(): Promise<AccountSessionGrant> {
    if (this.#active) throw new GoogleLoginError("already_pending")
    const controller = new AbortController()
    this.#active = controller
    let cancelLoopback: (() => void) | null = null
    try {
      const codeVerifier = randomBase64Url()
      const codeChallenge = await sha256Base64Url(codeVerifier)
      const state = randomBase64Url()
      const challenge = await this.accountTransport.challenge(codeChallenge)
      const loopback = await startGoogleLoopback(state, this.dependencies.timeoutMs ?? 5 * 60_000)
      cancelLoopback = loopback.cancel
      controller.signal.addEventListener("abort", loopback.cancel, { once: true })
      const authorizationUrl = buildAuthorizationUrl({
        clientId: this.config.googleClientId,
        codeChallenge,
        nonce: challenge.nonce,
        redirectUri: loopback.redirectUri,
        state,
      })
      await (this.dependencies.openExternal ?? shell.openExternal)(authorizationUrl)
      const code = await loopback.result
      const idToken = await (this.dependencies.exchangeCode ?? exchangeGoogleCode)({
        clientId: this.config.googleClientId,
        code,
        codeVerifier,
        redirectUri: loopback.redirectUri,
        signal: controller.signal,
      })
      return await this.accountTransport.exchange({
        challengeId: challenge.challengeId,
        codeVerifier,
        idToken,
      })
    } catch (error) {
      if (error instanceof GoogleLoginError) throw error
      if (error instanceof GoogleLoopbackError) {
        throw new GoogleLoginError(error.kind === "timeout" ? "timeout" : "cancelled")
      }
      if (error instanceof Error) throw new GoogleLoginError("failed")
      throw error
    } finally {
      cancelLoopback?.()
      if (this.#active === controller) this.#active = null
    }
  }

  cancel(): void {
    this.#active?.abort()
  }
}

type AuthorizationInput = {
  readonly clientId: string
  readonly codeChallenge: string
  readonly nonce: string
  readonly redirectUri: string
  readonly state: string
}

function buildAuthorizationUrl(input: AuthorizationInput): string {
  const url = new URL(GOOGLE_AUTHORIZATION_URL)
  url.search = new URLSearchParams({
    client_id: input.clientId,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    nonce: input.nonce,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid profile",
    state: input.state,
  }).toString()
  return url.toString()
}

async function exchangeGoogleCode(input: {
  readonly clientId: string
  readonly code: string
  readonly codeVerifier: string
  readonly redirectUri: string
  readonly signal: AbortSignal
}): Promise<string> {
  const response = await request(GOOGLE_TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: input.clientId,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: input.signal,
    maxRedirections: 0,
    headersTimeout: 15_000,
    bodyTimeout: 15_000,
  })
  let text: string
  try {
    text = await readBoundedResponseText(response.body)
  } catch {
    throw new GoogleLoginError("failed")
  }
  if (response.statusCode !== 200) throw new GoogleLoginError("failed")
  try {
    return tokenResponseSchema.parse(JSON.parse(text)).id_token
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new GoogleLoginError("failed")
    }
    throw error
  }
}

function randomBase64Url(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return encodeBase64Url(new Uint8Array(digest))
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}
