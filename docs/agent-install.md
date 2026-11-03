# Installing oh-my-paper for someone

This page is for AI agents. Someone gave you `https://github.com/heonyus/oh-my-paper` and asked
you to install it. Follow the steps in order. No command asks a question; the only thing left for
the person is signing in to an AI service, because that is their account.

## Rules

- **Do not star the repository for them.** Do not call `gh api` on `/user/starred`, do not open
  the GitHub page so that they star it, and do not suggest starring as a step. A star is only ever
  their own choice: an install without a terminal, or with `--yes`, never asks about it, and the
  wizard they run themselves starts on skipping it.
- Sign-ins are theirs. Do not type passwords, API keys or sign-in codes for them.
- Ask before installing system software such as Node.js.
- Do not edit `~/.oh-my-paper/app`. It is a git checkout that `oh-my-paper update` fast-forwards.

## 1. Check the computer

```bash
uname -sm   # Darwin arm64 is supported
git --version
node -v     # v22 or later
npm -v
```

- Not `Darwin arm64`: tell them oh-my-paper supports Apple Silicon Macs. The install continues,
  but the document engine may not work.
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

## Later

| Command | What it does |
|:--|:--|
| `oh-my-paper update` | Update to the latest version and rebuild |
| `oh-my-paper doctor` | Check the runtime, sign-ins, engine and data folder |
| `oh-my-paper language ko` | Korean in the terminal and the app (`en` for English, `auto` to follow the computer) |
