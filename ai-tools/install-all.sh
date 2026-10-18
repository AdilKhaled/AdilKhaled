#!/usr/bin/env bash
# Installs Claude Code, OmniRoute, claude-mem, Headroom and the task-observer skill.
# Linux / macOS. Re-runnable: already-installed tools are skipped.
# Usage: bash ai-tools/install-all.sh
set -euo pipefail

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

step "Checking prerequisites"
have node || { echo "Node.js not found. Install Node 22.22.2+ or 24.x from https://nodejs.org" >&2; exit 1; }
have npm  || { echo "npm not found." >&2; exit 1; }
have python3 || { echo "Python 3.10+ not found. Install from https://python.org" >&2; exit 1; }
echo "node $(node --version), python $(python3 --version | cut -d' ' -f2)"

if ! have uv; then
  step "Installing uv (needed by Headroom)"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

step "1/5 Claude Code"
if have claude; then
  echo "already installed: $(claude --version 2>/dev/null | head -n1)"
else
  curl -fsSL https://claude.ai/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
fi

step "2/5 OmniRoute"
if have omniroute; then
  echo "already installed: $(omniroute --version 2>/dev/null | tail -n1)"
else
  npm install -g omniroute
fi

step "3/5 claude-mem (Claude Code plugin)"
npx -y claude-mem install

step "4/5 Headroom"
if have headroom; then
  echo "already installed: $(headroom --version 2>/dev/null)"
else
  uv tool install --python 3.13 "headroom-ai[all]"
  export PATH="$HOME/.local/bin:$PATH"
fi

step "5/5 task-observer skill"
npx -y skills add rebelytics/one-skill-to-rule-them-all --skill task-observer -g -a claude-code -y

step "Done. Installed versions"
printf '  claude     %s\n' "$(claude --version 2>/dev/null | head -n1 || echo '?')"
printf '  omniroute  %s\n' "$(omniroute --version 2>/dev/null | tail -n1 || echo '?')"
printf '  claude-mem %s\n' "$(claude plugin list 2>/dev/null | grep -A1 claude-mem | grep -o 'Version: .*' || echo '?')"
printf '  headroom   %s\n' "$(headroom --version 2>/dev/null || echo '?')"
printf '  task-observer %s\n' "$([ -f "$HOME/.claude/skills/task-observer/SKILL.md" ] && echo installed || echo '?')"

cat <<'NEXT'

Next steps:
  - OmniRoute:     INITIAL_PASSWORD='strong-password' omniroute   -> http://localhost:20128
  - claude-mem:    npx claude-mem start                            -> http://127.0.0.1:37700
  - Headroom:      headroom wrap claude
  - task-observer: add the activation block to CLAUDE.md (see ai-tools/README.md, section 5)
  - Open a new terminal if a command is not found.
NEXT
