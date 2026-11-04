# Installing oh-my-paper for someone

This page is for AI agents. Someone gave you `https://github.com/heonyus/oh-my-paper` and asked
you to install it. Follow the steps in order. No command asks a question; the only thing left for
the person is signing in to an AI service, because that is their account.

The steps below are for macOS. On Windows, including an agent running in Git Bash or WSL, follow
[On Windows](#on-windows) instead: the rules are the same, and so is what they end up with.

## Rules

- **Do not star the repository for them.** Do not call `gh api` on `/user/starred`, do not open
  the GitHub page so that they star it, and do not suggest starring as a step. A star is only ever
  their own choice: an install without a terminal, or with `--yes`, never asks about it, and the
  wizard they run themselves starts on skipping it.
- Sign-ins are theirs. Do not type passwords, API keys or sign-in codes for them.
- Ask before installing system software such as Node.js.
- Do not edit `~/.oh-my-paper/app`. It is a git checkout that `oh-my-paper update` fast-forwards.
- On Windows, no administrator rights are needed: everything goes into their user profile. Do not
  change the machine's execution policy either; the commands below bypass it for their own process.

## 1. Check the computer

```bash
uname -sm   # Darwin arm64 is supported
git --version
node -v     # v22 or later
npm -v
```

- `MINGW…`, `MSYS…`, `CYGWIN…`, or a Linux kernel name with `microsoft` in it (WSL): this is
  Windows, so follow [On Windows](#on-windows).
- Another system (an Intel Mac, Linux): tell them oh-my-paper supports Apple Silicon Macs and
  Windows. The install continues, but the document engine may not work.
- No git: `xcode-select --install` opens a dialog they confirm.
- No Node.js, or one older than 22: with their OK, `brew install node` (or `brew upgrade node`).

## 2. Install

```bash
curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash -s -- --yes
```

- The first run takes a few minutes: it installs dependencies and builds the web app. Give the
  command at least 15 minutes, or run it in the background and wait until it exits.
- It clones the app into `~/.oh-my-paper/app`, installs and builds it, links
  `~/.local/bin/oh-my-paper` and adds `~/.local/bin` to `PATH` in `~/.zshrc` (or `~/.bashrc`).
  Then it runs `oh-my-paper onboard --yes`, which starts two downloads in the background,
  detached from the installer: the note's source-matching model (about 300 MB) and the document
  engine, PaddleOCR-VL (about 3 GB).
- Without a terminal the plain one-liner does the same; `--yes` makes sure it never stops at the
  interactive wizard, even when your shell has a terminal.
- If they do not want the 3 GB engine, add `--no-ocr`: `... | bash -s -- --yes --no-ocr`.
- It is done when it exits with status 0 after `Installed` (`설치 완료` in Korean). Running it
  again updates the install in place. When a step fails, the output names it and a log file: read
  the log, fix the cause (usually Node.js or the network) and run the same command again.

## 3. Check it

```bash
~/.local/bin/oh-my-paper doctor
```

Use the full path, since the `PATH` change applies to new terminals. Right after the install,
Node.js, the dependencies, the web app build and the ChatGPT sign-in runtime are fine, the OCR
engine is installing in the background (with `--no-ocr` it is flagged as optional), and no AI is
connected yet unless this Mac already has a Claude Code login. That is the expected state, and
`doctor` names the command for anything else. The AI connection it suggests is theirs (step 5).

The engine finishes in the background within about ten minutes. If you are still there, run
`doctor` again: `OCR engine · MLX acceleration` means it is ready and fast. Do not wait for it
before handing over.

## 4. Their language (optional)

The terminal and the app follow the computer's language. If you know they want Korean or
English regardless:

```bash
~/.local/bin/oh-my-paper language ko   # or en
```

## 5. Hand it over

Tell them, in their language:

- oh-my-paper is installed.
- To finish, they open a new terminal and run `oh-my-paper`. If no AI is connected yet, it first
  asks how to connect one (a ChatGPT subscription, a Claude subscription through Claude Code, or
  an API key) and guides the sign-in; then it opens the app at http://127.0.0.1:8788.
- The document engine keeps downloading in the background. Papers open right away meanwhile, and
  `oh-my-paper doctor` shows its progress.

Do not start the app for them unless they ask: `oh-my-paper` stays in the terminal that started
it and stops with it. `oh-my-paper menubar` keeps it running from the menu bar and starts it at
login; it adds a login item and needs the Xcode Command Line Tools, so ask first.

## On Windows

Windows 10 or 11 on x64 is supported. The person ends up with what a Mac user has: the
`oh-my-paper` command in every new terminal, the app at http://127.0.0.1:8788, the same wizard,
and a notification-area icon in place of the menu bar one.

### 0. Which shell you are in

- **PowerShell** (or cmd, through `powershell -Command`): follow the steps below as written.
- **Git Bash, MSYS2 or Cygwin** (`uname -s` starts with `MINGW`, `MSYS` or `CYGWIN`): the macOS
  one-liner `curl … install.sh | bash -s -- --yes` hands over to the Windows installer by itself.
  It is done when the output ends with `Installed` (`설치 완료` in Korean). Then follow step 3.
- **WSL** (`uname -r` contains `microsoft`): install on Windows, not inside Linux. The browser,
  the notification-area icon and the GPU engine are all on the Windows side, and an install in
  Linux would not be the one they open. From WSL, Windows' own PowerShell runs it:

  ```bash
  cd /mnt/c && powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '$f = Join-Path $env:TEMP oh-my-paper-install.ps1; irm https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.ps1 -OutFile $f; powershell -NoProfile -ExecutionPolicy Bypass -File $f -Yes; exit $LASTEXITCODE'
  ```

  `cd /mnt/c` keeps PowerShell out of a `\\wsl$` folder. The single quotes keep bash away from
  `$env`. Run the checks below the same way, through `powershell.exe -NoProfile -Command '…'`.

### 1. Check the computer

```powershell
[Runtime.InteropServices.RuntimeInformation]::OSArchitecture   # X64 is supported
git --version
node -v     # v22 or later
npm -v
```

- Not `X64` (Windows on ARM): tell them the document engine may be slower there. The install
  continues.
- No git, or no Node.js 22 or later: with their OK, install what is missing. The flags keep
  winget from stopping at its license prompt:

  ```powershell
  winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
  ```

  Then let this shell see them without a new terminal:

  ```powershell
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  ```

  The installer itself reads the PATH Windows stores, so it finds them either way.
- No `winget` (an old Windows 10): ask them to install **App Installer** from the Microsoft Store,
  or to run the installers from https://git-scm.com and https://nodejs.org (LTS).

### 2. Install

```powershell
irm https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.ps1 -OutFile "$env:TEMP\oh-my-paper-install.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\oh-my-paper-install.ps1" -Yes
```

- Running the saved file with `-File` gives you its exit status: it is done when it exits with
  status 0 after `Installed` (`설치 완료` in Korean). Give it at least 15 minutes, or run it in the
  background and wait until it exits; Windows Defender scans every new file, so the first install
  is slower than on macOS.
- It clones the app into `~\.oh-my-paper\app`, installs and builds it, writes
  `~\.local\bin\oh-my-paper.cmd` and adds `~\.local\bin` to the user PATH (new terminals see
  it). Then it runs `oh-my-paper onboard --yes`, which starts the same two background downloads
  as on macOS. The document engine also fetches llama.cpp and its model, so pages are read with
  the graphics card when there is one and quickly on the CPU otherwise. When the computer has an
  NVIDIA GPU and a WSL Ubuntu with `uv`, it sets up vLLM there too, the fastest option. Do not
  set up WSL for this; it is optional.
- `-NoOcr` leaves out the 3 GB document engine. Running the same commands again updates the
  install in place. When a step fails, the output names it and a log file: read the log, fix the
  cause (usually Node.js, the network, or an antivirus holding a file) and run the same commands
  again.

### 3. Check it

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
& "$env:USERPROFILE\.local\bin\oh-my-paper.cmd" doctor
```

The first line keeps Korean text readable when you capture the output. From Git Bash:
`"$USERPROFILE/.local/bin/oh-my-paper.cmd" doctor`.

Expect the same state as on macOS. Once the engine is done, `doctor` shows
`OCR engine · llama.cpp acceleration` (or `vLLM (WSL)`). `OCR engine · CPU (no acceleration)`
means the llama.cpp step was skipped; its reason is in the engine's install log, and running
`npm run setup:paddle-vl` in `~\.oh-my-paper\app` retries it. Do not wait for the engine before
handing over.

### 4. Language and hand-over

The same as on macOS: `oh-my-paper language ko` sets the language. For the hand-over, they open a
new terminal (PowerShell, Windows Terminal or cmd) and run `oh-my-paper`. `oh-my-paper menubar`
keeps it running from the notification area and starts it at sign-in. It adds a sign-in item, so
ask first. It needs nothing installed beyond Windows itself.

## Later

| Command | What it does |
|:--|:--|
| `oh-my-paper update` | Update to the latest version and rebuild |
| `oh-my-paper doctor` | Check the runtime, sign-ins, engine and data folder |
| `oh-my-paper language ko` | Korean in the terminal and the app (`en` for English, `auto` to follow the computer) |
