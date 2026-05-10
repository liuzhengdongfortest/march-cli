#!/usr/bin/env bash
#
# March CLI one-click installer for macOS / Linux
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
#   bash install.sh
#
set -euo pipefail

MINIMUM_NODE=20
RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'; RESET='\033[0m'

echo -e "${CYAN}── March CLI installer ──${RESET}"

# ── Node.js check ──────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}Error: Node.js not found. Install from https://nodejs.org/${RESET}"
  exit 1
fi

node_version=$(node --version | sed 's/^v//')
node_major=$(echo "$node_version" | cut -d. -f1)
if [ "$node_major" -lt "$MINIMUM_NODE" ]; then
  echo -e "${RED}Error: Node.js ${MINIMUM_NODE}+ required, found v${node_version}${RESET}"
  exit 1
fi
echo -e "  Node.js v${node_version}  ${GREEN}OK${RESET}"

# ── Install ────────────────────────────────────────────────────
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkg_root="$(cd "$script_dir/.." && pwd)"

if [ -f "$pkg_root/package.json" ]; then
  echo "  Installing from $pkg_root ..."
  npm install -g "$pkg_root"
else
  echo "  Installing march from npm registry ..."
  npm install -g march
fi

# ── Verify ─────────────────────────────────────────────────────
if command -v march &>/dev/null; then
  echo -e "  March CLI installed  ${GREEN}OK${RESET}"
  echo ""
  echo -e "${CYAN}Run 'march' to start. Run 'march --help' for options.${RESET}"
else
  echo -e "${YELLOW}Warning: march not found in PATH. Add npm global bin to PATH:${RESET}"
  echo "  export PATH=\$(npm bin -g):\$PATH"
fi
