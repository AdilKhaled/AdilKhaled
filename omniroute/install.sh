#!/usr/bin/env bash
# Installs OmniRoute globally with npm and prints how to run it.
# Requires Node.js >=22.22.2 <23 or >=24.0.0 <27.
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found. Install Node.js 22.22.2+ or 24.x from https://nodejs.org" >&2
  exit 1
fi

NODE_VERSION="$(node --version | sed 's/^v//')"
MAJOR="${NODE_VERSION%%.*}"
REST="${NODE_VERSION#*.}"
MINOR="${REST%%.*}"
PATCH="${REST#*.}"

supported=false
if [ "$MAJOR" -eq 22 ]; then
  if [ "$MINOR" -gt 22 ] || { [ "$MINOR" -eq 22 ] && [ "$PATCH" -ge 2 ]; }; then
    supported=true
  fi
elif [ "$MAJOR" -ge 24 ] && [ "$MAJOR" -lt 27 ]; then
  supported=true
fi

if [ "$supported" != true ]; then
  echo "WARNING: Node.js v$NODE_VERSION is outside the supported range (>=22.22.2 <23 || >=24.0.0 <27)." >&2
  echo "         Installation will continue, but upgrade Node.js for a supported, patched runtime." >&2
fi

echo "Installing omniroute (Node.js v$NODE_VERSION)..."
npm install -g omniroute

echo
echo "OmniRoute installed: $(omniroute --version 2>/dev/null | tail -n1 || echo unknown)"
echo
echo "Run it with a strong initial password:"
echo "  INITIAL_PASSWORD='your-strong-password' omniroute"
echo
echo "Dashboard: http://localhost:20128"
echo "API base:  http://localhost:20128/v1"
