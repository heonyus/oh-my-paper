import Cocoa

// oh-my-paper menu-bar companion.
// Shows whether the local web server (127.0.0.1:8788) is running, starts it via
// tsx when it is not, and opens the reader in the browser. A per-user
// LaunchAgent runs it, so neither it nor the server is a child of a terminal
// that may close: `oh-my-paper menubar` installs the agent.

let HEALTH_INTERVAL: TimeInterval = 5
let STARTING_BUDGET: TimeInterval = 30
let RESPAWN_BACKOFF: TimeInterval = 60
let LAUNCH_AGENT_LABEL = "com.honey.oh-my-paper.menubar"

let LAUNCH_AGENT_PATH = NSHomeDirectory() + "/Library/LaunchAgents/\(LAUNCH_AGENT_LABEL).plist"
let LOG_PATH = NSHomeDirectory() + "/Library/Logs/oh-my-paper/menubar.log"

let korean = Locale.preferredLanguages.first?.hasPrefix("ko") ?? false
func text(_ ko: String, _ en: String) -> String { korean ? ko : en }

struct Options {
  var repo = ""
  var port = "8788"
  var writeLaunchAgent = false
  var origin: String { "http://127.0.0.1:\(port)" }
}

func parseOptions() -> Options {
  var options = Options()
  var args = CommandLine.arguments.dropFirst()
  while let arg = args.popFirst() {
    switch arg {
    case "--repo": options.repo = args.popFirst() ?? options.repo
    case "--port": options.port = args.popFirst() ?? options.port
    case "--write-launch-agent": options.writeLaunchAgent = true
    default: break
    }
  }
  if options.repo.isEmpty {
    options.repo = FileManager.default.currentDirectoryPath
  }
  options.repo = URL(fileURLWithPath: options.repo).standardizedFileURL.path
  return options
}

// The agent starts the companion at login and again if it crashes; 종료 exits
// cleanly, which launchd leaves alone. launchd would start it with a bare PATH
// and none of the app's settings, so it carries those of the shell that
// installed it. The server's output lands in the log beside the companion's.
func writeLaunchAgent(_ options: Options) throws {
  let executable = URL(
    fileURLWithPath: Bundle.main.executablePath ?? CommandLine.arguments[0]
  ).standardizedFileURL.path
  let plist: [String: Any] = [
    "Label": LAUNCH_AGENT_LABEL,
    "ProgramArguments": [executable, "--repo", options.repo, "--port", options.port],
    "RunAtLoad": true,
    "KeepAlive": ["SuccessfulExit": false],
    "LimitLoadToSessionType": "Aqua",
    "WorkingDirectory": options.repo,
    "EnvironmentVariables": ProcessInfo.processInfo.environment.filter {
      $0.key == "PATH" || $0.key.hasPrefix("OH_MY_PAPER_")
    },
    "StandardOutPath": LOG_PATH,
    "StandardErrorPath": LOG_PATH,
  ]
  for path in [LAUNCH_AGENT_PATH, LOG_PATH] {
    try FileManager.default.createDirectory(
      atPath: (path as NSString).deletingLastPathComponent,
      withIntermediateDirectories: true)
  }
  try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
    .write(to: URL(fileURLWithPath: LAUNCH_AGENT_PATH), options: .atomic)
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
  let options: Options
  var statusItem: NSStatusItem!
  var child: Process?
  var state: ServerState = .stopped
  var startingSince = Date.distantPast
  var lastSpawnAt = Date.distantPast
  var stopSignal: DispatchSourceSignal?

  init(options: Options) {
    self.options = options
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let button = statusItem.button {
      button.image = NSImage(systemSymbolName: "leaf", accessibilityDescription: "oh-my-paper")
      button.image?.isTemplate = true
    }
    // launchd stops the companion with SIGTERM (`oh-my-paper menubar off`, or
    // a reinstall). The server runs in its own process group, so it would
    // outlive that unless it is taken down here.
    signal(SIGTERM, SIG_IGN)
    stopSignal = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    stopSignal?.setEventHandler { [weak self] in self?.quitApp() }
    stopSignal?.resume()
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
    let tsx = "\(options.repo)/node_modules/.bin/tsx"
    guard FileManager.default.isExecutableFile(atPath: tsx) else { return }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: tsx)
    process.arguments = ["src/server/main.ts"]
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
    case .running: return text("서버 실행 중", "Server running") + " — \(options.origin)"
    case .starting: return text("서버 시작 중…", "Server starting…")
    case .stopped: return text("서버 중지됨", "Server stopped")
    }
  }

  func rebuildMenu() {
    let menu = NSMenu()
    menu.addItem(withTitle: "oh-my-paper — \(statusLabel)", action: nil, keyEquivalent: "")
    let open = NSMenuItem(
      title: text("리더 열기", "Open reader"), action: #selector(openReader), keyEquivalent: "")
    open.target = self
    open.isEnabled = state == .running
    menu.addItem(open)
    menu.addItem(.separator())
    let login = NSMenuItem(
      title: text("로그인 시 자동 실행", "Start at login"), action: #selector(toggleLogin),
      keyEquivalent: "")
    login.target = self
    login.state = FileManager.default.fileExists(atPath: LAUNCH_AGENT_PATH) ? .on : .off
    menu.addItem(login)
    menu.addItem(.separator())
    let quit = NSMenuItem(
      title: text("종료", "Quit"), action: #selector(quitApp), keyEquivalent: "q")
    quit.target = self
    menu.addItem(quit)
    statusItem.menu = menu
    statusItem.button?.toolTip = "oh-my-paper — \(statusLabel)"
    // The leaf dims while the server is not answering.
    statusItem.button?.appearsDisabled = state != .running
  }

  @objc func openReader() {
    guard let url = URL(string: options.origin) else { return }
    NSWorkspace.shared.open(url)
  }

  @objc func toggleLogin(_ item: NSMenuItem) {
    if item.state == .on {
      try? FileManager.default.removeItem(atPath: LAUNCH_AGENT_PATH)
    } else {
      try? writeLaunchAgent(options)
    }
    rebuildMenu()
  }

  @objc func quitApp() {
    child?.terminate()
    NSApp.terminate(nil)
  }
}

let options = parseOptions()
if options.writeLaunchAgent {
  do {
    try writeLaunchAgent(options)
    print(LAUNCH_AGENT_PATH)
    exit(0)
  } catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
  }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { MenubarApp(options: options) }
app.delegate = delegate
app.run()
