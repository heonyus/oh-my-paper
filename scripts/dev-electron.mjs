import { spawn } from "node:child_process"
import net from "node:net"

const children = []
// A fixed IPv4 address: `localhost` can resolve to ::1 first (commonly on Windows), and
// then Vite would listen where the port check below never looks.
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: "inherit",
  env: process.env,
})
children.push(vite)

await waitForPort("127.0.0.1", 5173)

const electronEnv = { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:5173" }
delete electronEnv.ELECTRON_RUN_AS_NODE
const electron = spawn(process.execPath, ["node_modules/electron/cli.js", "."], {
  stdio: "inherit",
  env: electronEnv,
})
children.push(electron)

const stop = () => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM")
  }
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

const exitCode = await new Promise((resolve) => {
  electron.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)))
})
stop()
process.exitCode = exitCode

async function waitForPort(host, port) {
  for (;;) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port })
      socket.once("connect", () => {
        socket.destroy()
        resolve(true)
      })
      socket.once("error", () => {
        socket.destroy()
        resolve(false)
      })
    })
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
