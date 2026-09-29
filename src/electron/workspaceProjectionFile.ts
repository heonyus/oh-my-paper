import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { Workspace } from "../shared/schemas"
import { workspaceSchema } from "../shared/schemas"
import { replaceFile } from "./fileReplace"
import { markProjectionSource } from "./knowledgeLegacyMigration"

/**
 * Mirrors an acknowledged workspace to the server-mode JSON file. The projection validated its
 * records and settings as it read them, so only the file-backed notes' limit is checked here.
 * The marker is committed first, so a later open never imports the mirror as legacy data.
 */
export async function writeWorkspaceProjectionFile(
  db: DatabaseSync,
  file: string,
  workspace: Workspace,
): Promise<void> {
  workspaceSchema.shape.readerNotes.parse(workspace.readerNotes)
  markProjectionSource(db, file, workspace.documents.length + workspace.cards.length)
  const temporaryFile = `${file}.tmp`
  await mkdir(dirname(file), { recursive: true })
  await writeFile(temporaryFile, JSON.stringify({ ...workspace, layoutVersion: 2 }), {
    encoding: "utf8",
    mode: 0o600,
  })
  await replaceFile(temporaryFile, file)
}
