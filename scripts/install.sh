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
  printf '%s└%s  설치를 멈췄습니다. 로그: %s\n' "$DIM" "$RESET" "$LOG"
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
    fail "$label 실패"
  fi
}

banner
printf '%s┌%s  %soh-my-paper 설치%s  %s(%s)%s\n' "$DIM" "$RESET" "$BOLD" "$RESET" "$DIM" "$APP_DIR" "$RESET"

step "1/4  시스템 확인"
os="$(uname -s)" arch="$(uname -m)"
if [ "$os" = "Darwin" ] && [ "$arch" = "arm64" ]; then
  ok "macOS · Apple Silicon"
else
  warn "$os/$arch — 지원 대상은 Apple Silicon Mac입니다. 계속하지만 OCR 엔진은 동작하지 않을 수 있습니다"
fi
command -v git >/dev/null 2>&1 || fail "git이 없습니다" "xcode-select --install"
ok "git $(git --version | awk '{print $3}')"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js가 없습니다 (22 이상 필요)" "brew install node  또는  https://nodejs.org"
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || fail "Node.js $(node -v) — 22 이상이 필요합니다" "brew upgrade node"
ok "Node.js $(node -v)"
command -v npm >/dev/null 2>&1 || fail "npm이 없습니다" "Node.js를 다시 설치하세요"

# Brings an existing install up to the published branch: a fast-forward, or, when the published
# history was replaced (the repository was cleaned up and pushed anew) and nothing in the install
# was edited, the new history itself.
sync_app() {
  git -C "$APP_DIR" fetch --progress origin "$BRANCH" || return 1
  git -C "$APP_DIR" merge --ff-only "origin/$BRANCH" && return 0
  [ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || return 1
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
}

step "2/4  내려받기"
if [ -d "$APP_DIR/.git" ]; then
  run "최신 버전으로 업데이트" sync_app
else
  mkdir -p "$(dirname "$APP_DIR")"
  run "저장소 복제" git clone --progress --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

step "3/4  설치와 빌드"
printf '%s│%s  %s처음에는 몇 분 걸립니다%s\n' "$DIM" "$RESET" "$DIM" "$RESET"
run "의존성 설치" npm --prefix "$APP_DIR" ci --no-audit --no-fund \
  --loglevel=http --foreground-scripts
run "웹 앱 빌드" npm --prefix "$APP_DIR" run build:web

step "4/4  명령어 연결"
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
      ok "PATH에 추가했습니다 ($rc) — 새 터미널부터 적용됩니다"
    elif [ -z "$rc" ]; then
      warn "PATH에 추가하세요: $line"
    fi
    export PATH="$BIN_DIR:$PATH"
    ;;
esac

printf '%s└%s  %s설치 완료%s\n' "$DIM" "$RESET" "$GREEN" "$RESET"
rm -f "$LOG"

if [ -z "${OH_MY_PAPER_NO_ONBOARD:-}" ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
  # stdin is the piped script under `curl | bash`, so the wizard reads the terminal directly.
  exec "$BIN_DIR/oh-my-paper" onboard </dev/tty
fi
printf '\n  다음: %soh-my-paper onboard%s  → 설정 마법사\n       %soh-my-paper%s          → 앱 시작\n\n' \
  "$BOLD" "$RESET" "$BOLD" "$RESET"
