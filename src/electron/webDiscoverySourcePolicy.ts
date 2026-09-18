import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { z } from "zod"

const resolvedAddressSchema = z
  .object({
    address: z.string().refine((value) => isIP(value) !== 0, "Invalid IP address"),
    family: z.union([z.literal(4), z.literal(6)]),
  })
  .readonly()

export type ResolvedAddress = z.infer<typeof resolvedAddressSchema>
export type AddressResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>

export class SourcePolicyError extends Error {
  readonly name = "SourcePolicyError"

  constructor(
    readonly kind: "invalid_url" | "private_address" | "dns",
    message: string,
  ) {
    super(message)
  }
}

const blocked = new BlockList()
const blockedIpv4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]
for (const [network, prefix] of blockedIpv4) {
  blocked.addSubnet(network, prefix, "ipv4")
}
const blockedIpv6: readonly (readonly [string, number])[] = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]
for (const [network, prefix] of blockedIpv6) {
  blocked.addSubnet(network, prefix, "ipv6")
}

export function normalizePublicHttpsUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SourcePolicyError("invalid_url", "Source URL is invalid")
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname === "" ||
    url.hostname.toLowerCase() === "localhost" ||
    url.hostname.toLowerCase().endsWith(".local")
  ) {
    throw new SourcePolicyError("invalid_url", "Only public credential-free HTTPS URLs are allowed")
  }
  url.hash = ""
  return url
}

export const resolveAddresses: AddressResolver = async (hostname) => {
  try {
    return z
      .array(resolvedAddressSchema)
      .min(1)
      .parse(await lookup(hostname, { all: true }))
  } catch (error) {
    throw new SourcePolicyError(
      "dns",
      error instanceof Error ? error.message : "Source DNS lookup failed",
    )
  }
}

export function requirePublicAddress(addresses: readonly ResolvedAddress[]): ResolvedAddress {
  const result = z.array(resolvedAddressSchema).min(1).safeParse(addresses)
  if (!result.success) throw new SourcePolicyError("dns", "Source DNS lookup returned invalid data")
  const parsed = result.data
  for (const address of parsed) {
    const family = address.family === 4 ? "ipv4" : "ipv6"
    if (
      address.address.toLowerCase().startsWith("::ffff:") ||
      blocked.check(address.address, family)
    ) {
      throw new SourcePolicyError(
        "private_address",
        "Source resolves to a private or reserved address",
      )
    }
  }
  const first = parsed[0]
  if (first === undefined)
    throw new SourcePolicyError("dns", "Source DNS lookup returned no addresses")
  return first
}
