import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"

const executeFile = promisify(execFile)

class GuardError extends Error {
  name = "GuardError"
}

class DriftError extends GuardError {
  name = "DriftError"
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function parseOptions(argumentsList) {
  const command = argumentsList[0]
  if (command !== "snapshot" && command !== "check") {
    throw new GuardError(
      "usage: snapshot|check --allowlist <path> --out <manifest> or check --baseline <manifest>",
    )
  }

  const options = { allowlist: [], baseline: null, out: null }
  for (let index = 1; index < argumentsList.length; index += 1) {
    const option = argumentsList[index]
    const value = argumentsList[index + 1]
    if (option === "--allowlist" && value) {
      options.allowlist.push(value)
      index += 1
    } else if (option === "--baseline" && value) {
      options.baseline = value
      index += 1
    } else if (option === "--out" && value) {
      options.out = value
      index += 1
    } else {
      throw new GuardError(`unknown or incomplete option: ${option ?? ""}`)
    }
  }

  if (command === "snapshot" && (options.allowlist.length === 0 || !options.out)) {
    throw new GuardError("snapshot requires --allowlist and --out")
  }
  if (command === "check" && !options.baseline) {
    throw new GuardError("check requires --baseline")
  }
  return { command, ...options }
}

async function repositoryRoot() {
  const { stdout } = await executeFile("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
  return realpath(stdout.trim())
}

function relativePath(root, candidate) {
  const absolute = resolve(root, candidate)
  const path = relative(root, absolute)
  if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new GuardError(`allowlist path must stay inside the repository: ${candidate}`)
  }
  return path.split(sep).join("/")
}

async function allowlistedPaths(root, candidates) {
  const paths = new Set()
  for (const candidate of candidates) {
    const path = relativePath(root, candidate)
    const absolute = resolve(root, path)
    try {
      const resolved = await realpath(absolute)
      if (!relative(root, resolved) || relative(root, resolved).startsWith(`..${sep}`)) {
        throw new GuardError(`allowlist path must stay inside the repository: ${candidate}`)
      }
    } catch (error) {
      if (!isMissingError(error)) {
        throw error
      }
    }
    paths.add(path)
  }
  return [...paths].sort()
}

async function currentCommit(root) {
  const { stdout } = await executeFile("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  })
  return stdout.trim()
}

async function currentStatuses(root) {
  const { stdout } = await executeFile(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    { cwd: root, encoding: "utf8" },
  )
  const statuses = new Map()
  const records = stdout.split("\0")
  for (let index = 0; index < records.length - 1; index += 1) {
    const record = records[index]
    if (!record) {
      continue
    }
    const status = record.slice(0, 2)
    const path = record.slice(3)
    statuses.set(path, status)
    if (status[0] === "R" || status[0] === "C") {
      const originalPath = records[index + 1]
      if (originalPath) {
        statuses.set(originalPath, status)
        index += 1
      }
    }
  }
  return statuses
}

async function fileHash(root, path) {
  try {
    const bytes = await readFile(resolve(root, path))
    return createHash("sha256").update(bytes).digest("hex")
  } catch (error) {
    if (isMissingError(error)) {
      return null
    }
    throw error
  }
}

async function currentEntry(root, path, statuses) {
  const sha256 = await fileHash(root, path)
  return { path, status: statuses.get(path) ?? (sha256 ? "clean" : "missing"), sha256 }
}

function parseManifest(value) {
  if (!isRecord(value) || typeof value.commit !== "string" || !Array.isArray(value.entries)) {
    throw new GuardError("baseline manifest has an invalid shape")
  }
  const entries = value.entries.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.path !== "string" ||
      typeof entry.status !== "string" ||
      (entry.sha256 !== null && typeof entry.sha256 !== "string")
    ) {
      throw new GuardError("baseline manifest has an invalid entry")
    }
    return { path: entry.path, status: entry.status, sha256: entry.sha256 }
  })
  return { commit: value.commit, entries }
}

async function readManifest(path) {
  return parseManifest(JSON.parse(await readFile(path, "utf8")))
}

async function snapshot(root, paths, outputPath) {
  const statuses = await currentStatuses(root)
  const entries = []
  for (const path of paths) {
    entries.push(await currentEntry(root, path, statuses))
  }
  const manifest = { commit: await currentCommit(root), entries }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
}

async function check(root, manifestPath) {
  const baseline = await readManifest(manifestPath)
  for (const entry of baseline.entries) {
    if (relativePath(root, entry.path) !== entry.path) {
      throw new GuardError(`baseline path must stay inside the repository: ${entry.path}`)
    }
  }
  const statuses = await currentStatuses(root)
  const drift = []
  const commit = await currentCommit(root)
  if (commit !== baseline.commit) {
    drift.push("commit changed")
  }
  for (const entry of baseline.entries) {
    const current = await currentEntry(root, entry.path, statuses)
    if (current.status !== entry.status || current.sha256 !== entry.sha256) {
      drift.push(entry.path)
    }
  }
  if (drift.length > 0) {
    throw new DriftError(`worktree drift detected: ${drift.join(", ")}`)
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const root = await repositoryRoot()
  if (options.command === "snapshot") {
    const paths = await allowlistedPaths(root, options.allowlist)
    await snapshot(root, paths, resolve(process.cwd(), options.out))
    return
  }
  await check(root, resolve(process.cwd(), options.baseline))
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : "task worktree guard failed")
  process.exitCode = 1
}
