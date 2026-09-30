#!/usr/bin/env bash
# oh-my-paper installer
#
#   curl -fsSL https://raw.githubusercontent.com/heonyus/oh-my-paper/main/scripts/install.sh | bash
#
# Clones (or updates) the app into ~/.oh-my-paper/app, installs dependencies, builds the web
# app, links an `oh-my-paper` command into ~/.local/bin and starts the setup wizard.
# Override with OH_MY_PAPER_HOME, OH_MY_PAPER_BIN_DIR, OH_MY_PAPER_REPO, OH_MY_PAPER_BRANCH.
# Set OH_MY_PAPER_NO_ONBOARD=1 to skip the wizard.
set -euo pipefail

REPO="${OH_MY_PAPER_REPO:-https://github.com/heonyus/oh-my-paper.git}"
BRANCH="${OH_MY_PAPER_BRANCH:-main}"
APP_DIR="${OH_MY_PAPER_HOME:-$HOME/.oh-my-paper/app}"
BIN_DIR="${OH_MY_PAPER_BIN_DIR:-$HOME/.local/bin}"
LOG="$(mktemp -t oh-my-paper-install.XXXXXX)"

# The installer's language: OH_MY_PAPER_LANG, then the POSIX locale variables, then macOS's
# preferred language; English otherwise. Exported so the setup wizard speaks the same language.
ui_lang() {
  local tag
  for tag in "${OH_MY_PAPER_LANG:-}" "${LC_ALL:-}" "${LC_MESSAGES:-}" "${LANG:-}"; do
    case "$tag" in
      "" | C | C.* | POSIX) continue ;;
      ko*) echo ko && return ;;
      *) echo en && return ;;
    esac
  done
  if [ "$(uname -s)" = Darwin ]; then
    tag="$(defaults read -g AppleLanguages 2>/dev/null | LC_ALL=C tr -d ' "(),\n' | cut -c1-2)"
    [ "$tag" = ko ] && echo ko && return
  fi
  echo en
}
UI_LANG="$(ui_lang)"
export OH_MY_PAPER_LANG="$UI_LANG"

# The Korean or the English wording, by the installer's language.
m() {
  if [ "$UI_LANG" = ko ]; then printf '%s' "$1"; else printf '%s' "$2"; fi
}

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RED=$'\033[31m'
  CYAN=$'\033[36m' RESET=$'\033[0m'
else
  BOLD="" DIM="" GREEN="" YELLOW="" RED="" CYAN="" RESET=""
fi

paint() {
  # Rows fade leaf green → gold on 24-bit terminals; plain green elsewhere.
  if [ -n "$RESET" ] && [[ "${COLORTERM:-}" =~ (truecolor|24bit) ]]; then
    printf '\033[38;2;%sm%s%s' "$1" "$2" "$RESET"
  else
    printf '%s%s%s' "$GREEN" "$2" "$RESET"
  fi
}

banner() {
  printf '\n'
  printf '  %s\n' "$(paint '127;209;160' '┌─┐┬ ┬   ┌┬┐┬ ┬   ┌─┐┌─┐┌─┐┌─┐┬─┐')"
  printf '  %s   %s\n' "$(paint '183;202;115' '│ │├─┤───│││└┬┘───├─┘├─┤├─┘├┤ ├┬┘')" "${DIM}installer${RESET}"
  printf '  %s\n\n' "$(paint '239;194;69' '└─┘┴ ┴   ┴ ┴ ┴    ┴  ┴ ┴┴  └─┘┴└─')"
}

step() { printf '\n%s◆%s  %s%s%s\n' "$GREEN" "$RESET" "$BOLD" "$1" "$RESET"; }
ok() { printf '%s│%s  %s✔%s %s\n' "$DIM" "$RESET" "$GREEN" "$RESET" "$1"; }
warn() { printf '%s│%s  %s▲%s %s\n' "$DIM" "$RESET" "$YELLOW" "$RESET" "$1"; }
fail() {
  printf '%s│%s  %s✖%s %s\n' "$DIM" "$RESET" "$RED" "$RESET" "$1"
  [ -n "${2:-}" ] && printf '%s│%s    %s→ %s%s\n' "$DIM" "$RESET" "$DIM" "$2" "$RESET"
  printf '%s└%s  %s %s\n' "$DIM" "$RESET" "$(m '설치를 멈췄습니다. 로그:' 'Installation stopped. Log:')" "$LOG"
  exit 1
}

# The newest line of the log, as the spinner's dim second line: progress redraws split, color
# codes dropped, npm package downloads shown by name, cut to the terminal width. The Codex CLI,
# by far the largest download, is left out so its name does not linger there. The log holds
# localized (Korean) git output and may end mid-character, so the text tools work on bytes and
# iconv drops any split character; a byte cut never runs wider than the terminal.
latest() {
  tail -n 20 "$LOG" 2>/dev/null |
    LC_ALL=C tr '\r' '\n' | LC_ALL=C grep -v -i -e '^[[:space:]]*$' -e '@openai/codex' -e '@openai%2fcodex' |
    tail -n 1 |
    LC_ALL=C sed -E -e $'s/\x1b\\[[0-9;]*[A-Za-z]//g' \
      -e 's#^npm http cache [^ ]*/([^/ ]+)\.tgz .*#\1#' \
      -e 's#^npm http fetch [A-Z]+ [0-9]+ [^ ]*/([^/ ]+)\.tgz .*#\1#' |
    LC_ALL=C cut -c "1-$1" | iconv -c -f UTF-8 -t UTF-8 2>/dev/null
}

# Runs a command with a spinner and its latest output line beneath it; the full output goes to
# the log and is shown only on failure.
run() {
  local label="$1"
  shift
  "$@" >>"$LOG" 2>&1 &
  local pid=$! i=0 width
  local frames=('◒' '◐' '◓' '◑')
  if [ -t 1 ]; then
    width=$(($(tput cols 2>/dev/null || echo 80) - 10))
    [ "$width" -gt 20 ] || width=20
    while kill -0 "$pid" 2>/dev/null; do
      printf '\r\033[K%s│%s  %s%s%s %s\n\033[K%s│    %s%s\033[1A\r' "$DIM" "$RESET" "$CYAN" \
        "${frames[i++ % 4]}" "$RESET" "$label" "$DIM" "$(latest "$width" 2>/dev/null)" "$RESET"
      sleep 0.12
    done
    printf '\r\033[K\n\033[K\033[1A\r'
  fi
  if wait "$pid"; then
    ok "$label"
  else
    printf '%s\n' "$(tail -n 12 "$LOG" | sed "s/^/${DIM}│${RESET}    /")"
    fail "$label $(m '실패' 'failed')"
  fi
}

banner
printf '%s┌%s  %s%s%s  %s(%s)%s\n' "$DIM" "$RESET" "$BOLD" "$(m 'oh-my-paper 설치' 'Installing oh-my-paper')" "$RESET" "$DIM" "$APP_DIR" "$RESET"

step "1/4  $(m '시스템 확인' 'System check')"
os="$(uname -s)" arch="$(uname -m)"
if [ "$os" = "Darwin" ] && [ "$arch" = "arm64" ]; then
  ok "macOS · Apple Silicon"
else
  warn "$os/$arch — $(m '지원 대상은 Apple Silicon Mac입니다. 계속하지만 OCR 엔진은 동작하지 않을 수 있습니다' 'Apple Silicon Macs are supported. Continuing, but the OCR engine may not work')"
fi
command -v git >/dev/null 2>&1 || fail "$(m 'git이 없습니다' 'git is not installed')" "xcode-select --install"
ok "git $(git --version | awk '{print $3}')"
if ! command -v node >/dev/null 2>&1; then
  fail "$(m 'Node.js가 없습니다 (22 이상 필요)' 'Node.js is not installed (22 or later needed)')" "brew install node  $(m '또는' 'or')  https://nodejs.org"
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || fail "Node.js $(node -v) — $(m '22 이상이 필요합니다' '22 or later is needed')" "brew upgrade node"
ok "Node.js $(node -v)"
command -v npm >/dev/null 2>&1 || fail "$(m 'npm이 없습니다' 'npm is not installed')" "$(m 'Node.js를 다시 설치하세요' 'Reinstall Node.js')"

# Brings an existing install up to the published branch: a fast-forward, or, when the published
# history was replaced (the repository was cleaned up and pushed anew) and nothing in the install
# was edited, the new history itself.
sync_app() {
  git -C "$APP_DIR" fetch --progress origin "$BRANCH" || return 1
  git -C "$APP_DIR" merge --ff-only "origin/$BRANCH" && return 0
  [ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || return 1
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
}

step "2/4  $(m '내려받기' 'Download')"
if [ -d "$APP_DIR/.git" ]; then
  run "$(m '최신 버전으로 업데이트' 'Update to the latest version')" sync_app
else
  mkdir -p "$(dirname "$APP_DIR")"
  run "$(m '저장소 복제' 'Clone the repository')" git clone --progress --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

step "3/4  $(m '설치와 빌드' 'Install and build')"
printf '%s│%s  %s%s%s\n' "$DIM" "$RESET" "$DIM" "$(m '처음에는 몇 분 걸립니다' 'The first run takes a few minutes')" "$RESET"
run "$(m '의존성 설치' 'Install dependencies')" npm --prefix "$APP_DIR" ci --no-audit --no-fund \
  --loglevel=http --foreground-scripts
run "$(m '웹 앱 빌드' 'Build the web app')" npm --prefix "$APP_DIR" run build:web

step "4/4  $(m '명령어 연결' 'Link the command')"
mkdir -p "$BIN_DIR"
chmod +x "$APP_DIR/bin/oh-my-paper"
ln -sf "$APP_DIR/bin/oh-my-paper" "$BIN_DIR/oh-my-paper"
ok "$BIN_DIR/oh-my-paper"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    case "${SHELL##*/}" in
      zsh) rc="$HOME/.zshrc" ;;
      bash) rc="$HOME/.bashrc" ;;
      *) rc="" ;;
    esac
    line="export PATH=\"$BIN_DIR:\$PATH\""
    if [ -n "$rc" ] && ! grep -Fqs "$line" "$rc"; then
      printf '\n# oh-my-paper\n%s\n' "$line" >>"$rc"
      ok "$(m "PATH에 추가했습니다 ($rc) — 새 터미널부터 적용됩니다" "Added to PATH ($rc) — takes effect in new terminals")"
    elif [ -z "$rc" ]; then
      warn "$(m 'PATH에 추가하세요:' 'Add this to your PATH:') $line"
    fi
    export PATH="$BIN_DIR:$PATH"
    ;;
esac

printf '%s└%s  %s%s%s\n' "$DIM" "$RESET" "$GREEN" "$(m '설치 완료' 'Installed')" "$RESET"
rm -f "$LOG"

if [ -z "${OH_MY_PAPER_NO_ONBOARD:-}" ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
  # stdin is the piped script under `curl | bash`, so the wizard reads the terminal directly.
  exec "$BIN_DIR/oh-my-paper" onboard </dev/tty
fi
printf '\n  %s %soh-my-paper onboard%s  → %s\n       %soh-my-paper%s          → %s\n\n' \
  "$(m '다음:' 'Next:')" "$BOLD" "$RESET" "$(m '설정 마법사' 'setup wizard')" \
  "$BOLD" "$RESET" "$(m '앱 시작' 'start the app')"
