import { createTokenService } from "./appTokens"
import {
  ChallengeRequestSchema,
  ExchangeRequestSchema,
  LogoutRequestSchema,
  RenewalRequestSchema,
} from "./contracts"
import { ApiError } from "./errors"
import { createGoogleVerifier, GOOGLE_KEY_SET, type GoogleVerifier } from "./googleIdentity"
import { apiError, bearerToken, clientKey, json, readJson, routeError } from "./http"
import { createChallenge, exchangeChallenge } from "./login"
import { enforceRateLimit, type RateScope } from "./rateLimit"
import { runtimeConfig } from "./runtimeConfig"
import { accountForAccess, logoutSession, renewSession } from "./sessions"

type HandlerDependencies = {
  readonly now: () => number
  readonly verifyGoogleToken?: GoogleVerifier
}

export type AccountHandler = (request: Request, env: Env) => Promise<Response>

export function createHandler(dependencies: HandlerDependencies): AccountHandler {
  return async (request, env) => {
    try {
      const url = new URL(request.url)
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true, service: "ohmypaper-account", version: 1 })
      }

      const nowSeconds = dependencies.now()
      const scope = routeScope(url.pathname)
      if (scope) {
        await enforceRateLimit(env.DB, { scope, clientKey: clientKey(request), nowSeconds })
      }

      if (url.pathname === "/v1/auth/challenge" && request.method === "POST") {
        const body = await readJson(request, ChallengeRequestSchema)
        return json(
          await createChallenge(env.DB, {
            codeChallenge: body.codeChallenge,
            clientKey: clientKey(request),
            nowSeconds,
          }),
          201,
        )
      }
      if (url.pathname === "/v1/auth/exchange" && request.method === "POST") {
        const body = await readJson(request, ExchangeRequestSchema)
        const config = runtimeConfig(env)
        const verifyGoogleToken =
          dependencies.verifyGoogleToken ??
          createGoogleVerifier(GOOGLE_KEY_SET, config.googleClientIds)
        return json(
          await exchangeChallenge(env.DB, {
            request: body,
            nowSeconds,
            verifyGoogleToken,
            tokenService: await createTokenService(config.issuer, config.signingJwk),
          }),
        )
      }
      if (url.pathname === "/v1/auth/renew" && request.method === "POST") {
        const body = await readJson(request, RenewalRequestSchema)
        const config = runtimeConfig(env)
        return json(
          await renewSession(env.DB, {
            renewalToken: body.renewalToken,
            nowSeconds,
            tokenService: await createTokenService(config.issuer, config.signingJwk),
          }),
        )
      }
      if (url.pathname === "/v1/account" && request.method === "GET") {
        const config = runtimeConfig(env)
        const tokenService = await createTokenService(config.issuer, config.signingJwk)
        const identity = await tokenService.verifyAccess(bearerToken(request), nowSeconds)
        return json({ account: await accountForAccess(env.DB, identity, nowSeconds) })
      }
      if (url.pathname === "/v1/logout" && request.method === "POST") {
        const body = await readJson(request, LogoutRequestSchema)
        await logoutSession(env.DB, body.renewalToken, nowSeconds)
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
      }
      if (scope) return routeError(405, "method_not_allowed", "Method not allowed")
      return routeError(404, "not_found", "Route not found")
    } catch (error) {
      if (error instanceof ApiError) return apiError(error)
      throw error
    }
  }
}

function routeScope(pathname: string): RateScope | null {
  switch (pathname) {
    case "/v1/auth/challenge":
      return "challenge"
    case "/v1/auth/exchange":
      return "exchange"
    case "/v1/auth/renew":
      return "renew"
    case "/v1/account":
      return "account"
    case "/v1/logout":
      return "logout"
    default:
      return null
  }
}

const handler = createHandler({ now: () => Math.floor(Date.now() / 1_000) })

export default {
  fetch: handler,
} satisfies ExportedHandler<Env>
