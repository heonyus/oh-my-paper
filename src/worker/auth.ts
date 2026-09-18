import { betterAuth } from "better-auth"

export function createAuth(request: Request, env: Env, context: ExecutionContext) {
  const origin = new URL(request.url).origin
  return betterAuth({
    appName: "oh-my-paper",
    baseURL: origin,
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    advanced: {
      database: { generateId: "uuid", joins: true },
      backgroundTasks: { handler: (task) => context.waitUntil(task) },
    },
  })
}

export async function sessionUser(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<{ readonly id: string; readonly name: string } | null> {
  const session = await createAuth(request, env, context).api.getSession({
    headers: request.headers,
  })
  return session ? { id: session.user.id, name: session.user.name } : null
}
