import { chmod, writeFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * Writes an executable stand-in for the `claude` CLI. The `--model` argument picks the
 * behaviour so tests stay hermetic even though the real CLI only inherits an allowlisted env.
 */
export async function writeFakeClaudeCli(
  root: string,
  auth: { readonly loggedIn: boolean } = { loggedIn: true },
): Promise<string> {
  const path = join(root, "fake-claude")
  const script = `#!${process.execPath}
const args = process.argv.slice(2)
const out = (value) => process.stdout.write(JSON.stringify(value) + "\\n")
if (args[0] === "auth" && args[1] === "status") {
  out({ loggedIn: ${auth.loggedIn}, authMethod: "claude.ai", email: "reader@example.test", subscriptionType: "max" })
  process.exit(0)
}
const model = args[args.indexOf("--model") + 1]
let input = ""
process.stdin.on("data", (chunk) => { input += chunk })
process.stdin.on("end", () => {
  const message = JSON.parse(input.trim()).message
  const delta = (text, parent = null) =>
    out({ type: "stream_event", parent_tool_use_id: parent, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } })
  out({ type: "system", subtype: "init" })
  if (model === "fake-auth") {
    out({ type: "assistant", error: "authentication_failed", message: {} })
    out({ type: "result", is_error: true, result: "Please run /login", api_error_status: 401 })
    return
  }
  if (model === "fake-crash") {
    process.stderr.write("boom from cli\\n")
    process.exit(3)
  }
  if (model === "fake-hang") {
    setTimeout(() => undefined, 60_000)
    return
  }
  if (model === "fake-echo") {
    delta(JSON.stringify({ types: message.content.map((block) => block.type), args }))
    out({ type: "result", is_error: false, result: "" })
    return
  }
  delta("Hel")
  delta("SUBAGENT", "toolu_1")
  delta("lo")
  out({ type: "result", is_error: false, result: "Hello" })
})
`
  await writeFile(path, script, "utf8")
  await chmod(path, 0o755)
  return path
}
