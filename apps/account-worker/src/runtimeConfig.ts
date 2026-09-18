import { z } from "zod"

import { ApiError } from "./errors"

const RuntimeConfigSchema = z
  .object({
    issuer: z.url(),
    googleClientIds: z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().min(1).max(255)).min(1).max(8)),
    signingJwk: z
      .string()
      .max(4_096)
      .transform((value, context): unknown => {
        try {
          return JSON.parse(value)
        } catch (error) {
          if (error instanceof SyntaxError) {
            context.addIssue({ code: "custom", message: "Signing JWK must be JSON" })
            return z.NEVER
          }
          throw error
        }
      })
      .pipe(
        z
          .object({
            kty: z.literal("EC"),
            crv: z.literal("P-256"),
            x: z.string().regex(/^[A-Za-z0-9_-]+$/),
            y: z.string().regex(/^[A-Za-z0-9_-]+$/),
            d: z.string().regex(/^[A-Za-z0-9_-]+$/),
          })
          .strict(),
      ),
  })
  .strict()

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>
export type SigningJwk = RuntimeConfig["signingJwk"]

export function runtimeConfig(env: Env): RuntimeConfig {
  const parsed = RuntimeConfigSchema.safeParse({
    issuer: env.APP_ISSUER,
    googleClientIds: env.GOOGLE_CLIENT_IDS,
    signingJwk: env.APP_JWT_SIGNING_JWK,
  })
  if (!parsed.success) {
    throw new ApiError(500, "service_misconfigured", "Account service is not configured")
  }
  return parsed.data
}
