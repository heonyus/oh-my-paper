import { z } from "zod"

const encryptedValueSchema = z.string().regex(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/u)

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const material = decode(secret)
  if (material.byteLength !== 32) throw new Error("credential encryption key must be 32 bytes")
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ])
}

export async function encryptCredential(secret: string, apiKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    new TextEncoder().encode(apiKey),
  )
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`
}

export async function decryptCredential(secret: string, value: string): Promise<string> {
  const [version, encodedIv, encodedCiphertext] = encryptedValueSchema.parse(value).split(".")
  if (version !== "v1" || !encodedIv || !encodedCiphertext)
    throw new Error("credential ciphertext is invalid")
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(encodedIv) },
    await encryptionKey(secret),
    decode(encodedCiphertext),
  )
  return new TextDecoder().decode(plaintext)
}
