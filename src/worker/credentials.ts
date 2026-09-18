import { z } from "zod"
import {
  hostedCredentialProviderSchema,
  hostedCredentialSaveSchema,
} from "../shared/webCredentials"
import { HttpError, json } from "./http"
import { saveUserCredential, userCredentialStatus } from "./userCredentials"

export async function credentialResponse(
  request: Request,
  env: Env,
  userId: string,
  providerValue?: string,
): Promise<Response> {
  if (request.method === "GET" && providerValue === undefined)
    return json(await userCredentialStatus(env, userId))
  if (request.method !== "PUT" || providerValue === undefined)
    throw new HttpError(405, "method_not_allowed")
  const provider = hostedCredentialProviderSchema.parse(providerValue)
  const body = z.record(z.string(), z.unknown()).parse(await request.json())
  const input = hostedCredentialSaveSchema.parse({
    ...body,
    provider,
  })
  await saveUserCredential(env, userId, input)
  return json(await userCredentialStatus(env, userId))
}
