import Cocoa

// oh-my-paper menu-bar companion.
// Shows whether the local web server (127.0.0.1:8788) is running, starts it via
// tsx when it is not, opens the reader in the browser, and can register itself
// as a login item through a per-user LaunchAgent.

let HEALTH_INTERVAL: TimeInterval = 5
let STARTING_BUDGET: TimeInterval = 30
let RESPAWN_BACKOFF: TimeInterval = 60
let LAUNCH_AGENT_LABEL = "com.honey.oh-my-paper.menubar"

struct Options {
  var repo = ""
  var port = "8788"
  var origin: String { "http://127.0.0.1:\(port)" }
}

func parseOptions() -> Options {
  var options = Options()
  var args = CommandLine.arguments.dropFirst()
  while let arg = args.popFirst() {
    switch arg {
    case "--repo": options.repo = args.popFirst() ?? options.repo
    case "--port": options.port = args.popFirst() ?? options.port
    default: break
    }
  }
  if options.repo.isEmpty {
    options.repo = FileManager.default.currentDirectoryPath
  }
  return options
}

func probe(origin: String) async -> Bool {
  guard let url = URL(string: "\(origin)/api/workspace") else { return false }
  var request = URLRequest(url: url)
  request.timeoutInterval = 2
  guard let (_, response) = try? await URLSession.shared.data(for: request),
        let http = response as? HTTPURLResponse else { return false }
  return (200..<300).contains(http.statusCode)
}

enum ServerState { case running, starting, stopped }

@MainActor final class MenubarApp: NSObject, NSApplicationDelegate {
  let options = parseOptions()
  var statusItem: NSStatusItem!
  var child: Process?
  var state: ServerState = .stopped
  var startingSince = Date.distantPast
  var lastSpawnAt = Date.distantPast

  var launchAgentPath: String {
    NSHomeDirectory() + "/Library/LaunchAgents/\(LAUNCH_AGENT_LABEL).plist"
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let button = statusItem.button {
      button.image = NSImage(systemSymbolName: "leaf", accessibilityDescription: "oh-my-paper")
      button.image?.isTemplate = true
    }
    Task { await self.tick() }
    Timer.scheduledTimer(withTimeInterval: HEALTH_INTERVAL, repeats: true) { _ in
      Task { await self.tick() }
    }
  }

  func tick() async {
    let alive = await probe(origin: options.origin)
    if alive {
      state = .running
    } else if child != nil {
      state = Date().timeIntervalSince(startingSince) < STARTING_BUDGET ? .starting : .stopped
    } else {
      state = .stopped
    }
    if state == .stopped && child == nil
      && Date().timeIntervalSince(lastSpawnAt) > RESPAWN_BACKOFF {
      spawnServer()
    }
    rebuildMenu()
  }

  func spawnServer() {
    guard FileManager.default.fileExists(
      atPath: "\(options.repo)/node_modules/.bin/tsx") else { return }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [
      "-lc",
      "cd \(options.repo.shellEscaped) && exec ./node_modules/.bin/tsx src/server/main.ts",
    ]
    process.currentDirectoryURL = URL(fileURLWithPath: options.repo)
    process.terminationHandler = { [weak self] _ in
      Task { @MainActor in
        guard let self else { return }
        self.child = nil
        await self.tick()
      }
    }
    do {
      try process.run()
      child = process
      state = .starting
      startingSince = Date()
      lastSpawnAt = startingSince
    } catch {
      state = .stopped
    }
  }

  var statusLabel: String {
    switch state {
    case .running: return "서버 실행 중 — \(options.origin)"
    case .starting: return "서버 시작 중…"
    case .stopped: return "서버 중지됨"
    }
  }

  func rebuildMenu() {
    let menu = NSMenu()
    menu.addItem(withTitle: "oh-my-paper — \(statusLabel)", action: nil, keyEquivalent: "")
    let open = NSMenuItem(
      title: "리더 열기", action: #selector(openReader), keyEquivalent: "")
    open.target = self
    open.isEnabled = state == .running
    menu.addItem(open)
    menu.addItem(.separator())
    let login = NSMenuItem(
      title: "로그인 시 자동 실행", action: #selector(toggleLogin), keyEquivalent: "")
    login.target = self
    login.state = FileManager.default.fileExists(atPath: launchAgentPath) ? .on : .off
    menu.addItem(login)
    menu.addItem(.separator())
    let quit = NSMenuItem(title: "종료", action: #selector(quitApp), keyEquivalent: "q")
    quit.target = self
    menu.addItem(quit)
    statusItem.menu = menu
    statusItem.button?.toolTip = "oh-my-paper — \(statusLabel)"
  }

  @objc func openReader() {
    guard let url = URL(string: options.origin) else { return }
    NSWorkspace.shared.open(url)
  }

  @objc func toggleLogin(_ item: NSMenuItem) {
    let path = launchAgentPath
    if item.state == .on {
      try? FileManager.default.removeItem(atPath: path)
    } else {
      let executable = CommandLine.arguments[0]
      let args = [executable, "--repo", options.repo, "--port", options.port]
        .map { "      <string>\($0.xmlEscaped)</string>" }
        .joined(separator: "\n")
      let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key>
          <string>\(LAUNCH_AGENT_LABEL)</string>
          <key>ProgramArguments</key>
        <array>
        \(args)
        </array>
          <key>RunAtLoad</key>
          <true/>
          <key>WorkingDirectory</key>
          <string>\(options.repo.xmlEscaped)</string>
        </dict>
        </plist>
        """
      try? FileManager.default.createDirectory(
        atPath: (path as NSString).deletingLastPathComponent,
        withIntermediateDirectories: true)
      try? plist.write(toFile: path, atomically: true, encoding: .utf8)
    }
    rebuildMenu()
  }

  @objc func quitApp() {
    child?.terminate()
    NSApp.terminate(nil)
  }
}

extension String {
  var shellEscaped: String { "'\(replacingOccurrences(of: "'", with: "'\\''"))'" }
  var xmlEscaped: String {
    replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
  }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { MenubarApp() }
app.delegate = delegate
app.run()
