// Moves the programs and native libraries (.exe, .node, .dll) that something still has open out
// of node_modules, so `npm ci` can delete it on Windows while oh-my-paper runs: Windows deletes
// no program or library in use, but it does let one be renamed within its drive. They land in
// .update-trash beside node_modules and go on the next run, once nothing has them open. Elsewhere
// a file in use can be deleted, so this does nothing.
//
//   node scripts/release-locked-files.mjs [app folder]
//
// `oh-my-paper update` and scripts/install.ps1 run it before `npm ci`.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const NATIVE_FILE = /\.(exe|node|dll)$/i

/** Whether another program has the file open for running or loading, as Windows reports it. */
function inUse(path) {
  try {
    closeSync(openSync(path, "r+"))
    return false
  } catch (error) {
    return error?.code === "EBUSY" || error?.code === "EPERM" || error?.code === "EACCES"
  }
}

/** Every native file under `root`, without following links (npm leaves junctions there). */
function* nativeFiles(root) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) yield* nativeFiles(path)
    else if (entry.isFile() && NATIVE_FILE.test(entry.name)) yield path
  }
}

/** Empties the trash of earlier runs as far as nothing holds it, and returns how many remain. */
export function emptyTrash(trash) {
  if (!existsSync(trash)) return 0
  let kept = 0
  for (const name of readdirSync(trash)) {
    try {
      rmSync(join(trash, name), { recursive: true, force: true })
    } catch {
      kept += 1
    }
  }
  if (kept === 0) rmSync(trash, { recursive: true, force: true })
  return kept
}

/**
 * Moves the native files in use under `appRoot/node_modules` into `appRoot/.update-trash` and
 * returns their paths. `isInUse` and `platform` stand in for Windows in tests.
 */
export function releaseLockedFiles(
  appRoot,
  { platform = process.platform, isInUse = inUse, log = () => undefined } = {},
) {
  const trash = join(appRoot, ".update-trash")
  const kept = emptyTrash(trash)
  if (kept > 0) log(`${kept} file(s) from an earlier update are still in use`)
  if (platform !== "win32") return []
  const moved = []
  for (const path of nativeFiles(join(appRoot, "node_modules"))) {
    if (!isInUse(path)) continue
    mkdirSync(trash, { recursive: true })
    const target = join(trash, `${Date.now()}-${moved.length}-${basename(path)}`)
    try {
      renameSync(path, target)
      moved.push(path)
      log(`moved aside: ${path}`)
    } catch (error) {
      log(`could not move ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return moved
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appRoot = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), "..", ".."))
  const moved = releaseLockedFiles(appRoot, { log: (line) => process.stdout.write(`${line}\n`) })
  process.stdout.write(`release-locked-files: ${moved.length} file(s) moved aside\n`)
}
