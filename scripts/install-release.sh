#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/share/sylastra-agent-tree"
BIN_DIR="${INSTALL_DIR}/bin"
OPENCODE_CONFIG="${HOME}/.config/opencode/opencode.jsonc"
PLUGIN_FILE_URL="file://${INSTALL_DIR}"

# ── Utils ────────────────────────────────────
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}[i]${NC} $1"; }
ok()    { echo -e "${GREEN}[ok]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
step()  { echo -e "${DIM}[$1/4]${NC} $2"; }

# ── Platform detection ───────────────────────
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Linux)  os="linux"  ;;
    Darwin) os="darwin" ;;
    *)      echo "Unsupported OS: $(uname -s)"; exit 1 ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)            echo "Unsupported arch: $(uname -m)"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

register_without_jq() {
  mkdir -p "$(dirname "${OPENCODE_CONFIG}")"

  if [ ! -f "${OPENCODE_CONFIG}" ]; then
    cat > "${OPENCODE_CONFIG}" <<EOF
{
  "plugin": [
    "${PLUGIN_FILE_URL}"
  ]
}
EOF
    ok "Created ${OPENCODE_CONFIG} with plugin entry"
    return 0
  fi

  if grep -q "${INSTALL_DIR}" "${OPENCODE_CONFIG}" 2>/dev/null || grep -q "${PLUGIN_FILE_URL}" "${OPENCODE_CONFIG}" 2>/dev/null; then
    info "Plugin already registered in ${OPENCODE_CONFIG}"
    return 0
  fi

  warn "Plugin files were installed, but jq is not available to modify existing OpenCode config."
  warn "Please add this plugin entry manually:"
  echo "  ${BLUE}${PLUGIN_FILE_URL}${NC}"
  return 0
}

# ── Main ─────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}sylastra-agent-tree Installer${NC}"
  echo "=============================="
  echo ""

  step 1 "Detecting platform..."
  PLATFORM="$(detect_platform)"
  BET_BINARY="better-edit-tools-${PLATFORM}"
  info "Platform: ${PLATFORM}"

  step 2 "Creating directories..."
  mkdir -p "${INSTALL_DIR}" "${BIN_DIR}"
  ok "Created ${INSTALL_DIR}"

  # Copy plugin files (everything except bin/ and ourselves)
  for item in "${SCRIPT_DIR}"/*; do
    case "$(basename "${item}")" in
      install.sh|bin) continue ;;
    esac
    cp -r "${item}" "${INSTALL_DIR}/"
  done

  # Copy the dist directory if it exists
  if [ -d "${SCRIPT_DIR}/dist" ]; then
    cp -r "${SCRIPT_DIR}/dist" "${INSTALL_DIR}/"
  fi

  ok "Plugin files installed"

  step 3 "Installing better-edit-tools..."
  if [ -f "${SCRIPT_DIR}/bin/${BET_BINARY}" ]; then
    cp "${SCRIPT_DIR}/bin/${BET_BINARY}" "${BIN_DIR}/better-edit-tools"
    chmod +x "${BIN_DIR}/better-edit-tools"
    ok "better-edit-tools installed (${BET_BINARY})"
  elif [ -f "${SCRIPT_DIR}/${BET_BINARY}" ]; then
    cp "${SCRIPT_DIR}/${BET_BINARY}" "${BIN_DIR}/better-edit-tools"
    chmod +x "${BIN_DIR}/better-edit-tools"
    ok "better-edit-tools installed (${BET_BINARY})"
  else
    warn "better-edit-tools binary not found for ${PLATFORM}"
    warn "You can install it manually from: https://github.com/conglinyizhi/better-edit-tools-mcp"
  fi

  step 4 "Registering plugin in OpenCode..."
  if [ -x "${INSTALL_DIR}/dist/cli/index.js" ]; then
    if command -v bun >/dev/null 2>&1; then
      bun "${INSTALL_DIR}/dist/cli/index.js" install --no-tui --skills=no || register_without_jq
    else
      node "${INSTALL_DIR}/dist/cli/index.js" install --no-tui --skills=no || register_without_jq
    fi
  else
    register_without_jq
  fi

  echo ""
  echo -e "${GREEN}${BOLD}Installation complete!${NC}"
  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo ""
  echo "  1. Log in to your provider(s):"
  echo "     ${BLUE}\$ opencode auth login${NC}"
  echo ""
  echo "  2. Refresh models:"
  echo "     ${BLUE}\$ opencode models --refresh${NC}"
  echo ""
  echo "  3. Review config at:"
  echo "     ${BLUE}${INSTALL_DIR}/sylastra-agent-tree.json${NC}"
  echo ""
  echo "  4. Start OpenCode:"
  echo "     ${BLUE}\$ opencode${NC}"
  echo ""
}

main "$@"
