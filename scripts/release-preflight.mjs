import { access, readFile } from "node:fs/promises"
import process from "node:process"

const root = new URL("../", import.meta.url)
const packagePath = new URL("package.json", root)
const expectedFiles = ["dist/**", "dist-electron/**"]
const releaseScripts = ["package", "make", "dist:mac"]

function line(status, subject, detail) {
  console.log(`${status.padEnd(12)} ${subject}: ${detail}`)
}

function sameValues(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  )
}

function hasCompleteEnvironment(names) {
  return names.every((name) => Boolean(process.env[name]))
}

async function main() {
  const unsupportedIndex = process.argv.indexOf("--unsupported")
  if (unsupportedIndex >= 0) {
    const target = process.argv[unsupportedIndex + 1] ?? "requested platform"
    line("UNSUPPORTED", target, "oh-my-paper release commands support Apple Silicon macOS only")
    process.exitCode = 1
    return
  }

  const packageJson = JSON.parse(await readFile(packagePath, "utf8"))
  const failures = []
  const readiness = []
  const check = (condition, subject, detail) => {
    line(condition ? "PASS" : "FAIL", subject, detail)
    if (!condition) failures.push(subject)
  }

  check(packageJson.private === true, "npm publishing", "package is private")

  for (const name of releaseScripts) {
    const command = packageJson.scripts?.[name]
    const safe =
      typeof command === "string" &&
      command.includes("--mac") &&
      command.includes("--arm64") &&
      command.includes("--publish never") &&
      !command.includes("--x64")
    check(safe, `script ${name}`, "macOS arm64 with publishing disabled")
  }

  for (const [name, platform] of [
    ["dist:win", "win32"],
    ["dist:linux", "linux"],
  ]) {
    check(
      packageJson.scripts?.[name] ===
        `node scripts/release-preflight.mjs --unsupported ${platform}`,
      `script ${name}`,
      "explicitly disabled",
    )
  }

  const targets = packageJson.build?.mac?.target
  const arm64Targets =
    Array.isArray(targets) &&
    targets.length === 2 &&
    targets.every(
      (target) =>
        target &&
        typeof target === "object" &&
        ["dmg", "zip"].includes(target.target) &&
        sameValues(target.arch, ["arm64"]),
    )
  check(arm64Targets, "mac targets", "DMG and ZIP are arm64 only")
  check(
    sameValues(packageJson.build?.files, expectedFiles),
    "bundle allowlist",
    "dist and dist-electron only",
  )

  const resources = packageJson.build?.extraResources ?? []
  const resourcePaths = Array.isArray(resources)
    ? resources.flatMap((entry) =>
        entry && typeof entry === "object" && typeof entry.from === "string" ? [entry.from] : [],
      )
    : []
  const forbiddenResource = resourcePaths.find((path) =>
    /(^|[/\\])(?:tests?|private|secrets?|\.env(?:\.[^/\\]+)?)([/\\]|$)/iu.test(path),
  )
  check(
    forbiddenResource === undefined,
    "extra resources",
    forbiddenResource
      ? `forbidden path: ${forbiddenResource}`
      : "no test, env, private, or secret path",
  )

  const icon = packageJson.build?.mac?.icon
  let iconExists = false
  if (typeof icon === "string") {
    try {
      await access(new URL(icon, root))
      iconExists = true
    } catch {
      iconExists = false
    }
  }
  check(iconExists, "mac icon", "configured file exists")

  if (failures.length) {
    line("BLOCKED", "configuration", `${failures.length} safety check(s) failed`)
    process.exitCode = 1
    return
  }

  if (process.argv.includes("--config-only")) {
    line(
      "COMPLETE",
      "configuration",
      "safe target settings verified; release readiness not evaluated",
    )
    return
  }

  const signingEnvironment = ["CSC_LINK", "CSC_NAME"].some((name) => Boolean(process.env[name]))
  line(
    "UNVERIFIED",
    "code signing",
    signingEnvironment
      ? "credential variable name detected; value hidden and signature not inspected"
      : "CSC_LINK/CSC_NAME absent; Keychain identities were not inspected",
  )
  if (!signingEnvironment) readiness.push("code signing credentials")

  const notarizeConfigured = packageJson.build?.mac?.notarize === true
  const notarizeEnvironment =
    hasCompleteEnvironment(["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"]) ||
    hasCompleteEnvironment(["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"])
  line(
    "UNVERIFIED",
    "notarization",
    `${notarizeConfigured ? "configured" : "build.mac.notarize missing"}; ${
      notarizeEnvironment
        ? "credential variable names detected, values hidden"
        : "complete credential set absent"
    }; ticket not submitted or stapled`,
  )
  if (!notarizeConfigured || !notarizeEnvironment) readiness.push("notarization configuration")

  const minimumSystemVersion = packageJson.build?.mac?.minimumSystemVersion
  line(
    "UNVERIFIED",
    "oldest macOS",
    typeof minimumSystemVersion === "string"
      ? `minimum ${minimumSystemVersion} configured but not run on that OS`
      : "minimumSystemVersion missing and no oldest-OS run recorded",
  )
  if (typeof minimumSystemVersion !== "string") readiness.push("minimum macOS configuration")

  if (process.platform !== "darwin" || process.arch !== "arm64") {
    readiness.push("Apple Silicon macOS host")
    line("BLOCKED", "host", `requires darwin arm64; found ${process.platform} ${process.arch}`)
  } else {
    line("PASS", "host", "darwin arm64")
  }

  if (readiness.length) {
    line("BLOCKED", "release readiness", readiness.join(", "))
    process.exitCode = 1
    return
  }
  line(
    "CONFIGURED",
    "release inputs",
    "present, but signing/notarization/oldest-OS outcomes remain unverified",
  )
}

await main()
