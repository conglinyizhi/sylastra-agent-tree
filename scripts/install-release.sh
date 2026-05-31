#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# sylastra-agent-tree  release installer
#
# Usage:
#   Run from the extracted release directory:
#     ./install.sh
#
#   Or from anywhere with the release tarball extracted:
#     bash /path/to/sylastra-agent-tree-<version>/install.sh
#
# What it does:
#   1. Detects OS and architecture
#   2. Installs the plugin into ~/.local/share/sylastra-agent-tree/
#   3. Symlinks better-edit-tools binary into the plugin's bin directory
#   4. Registers the plugin in OpenCode config
# ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/share/sylastra-agent-tree"
BIN_DIR="${INSTALL_DIR}/bin"
OPENCODE_CONFIG="${HOME}/.config/opencode/opencode.jsonc"
PLUGIN_NAME="sylastra-agent-tree"

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
step()  { echo -e "${DIM}[$1/5]${NC} $2"; }

# ── Platform detection ───────────────────────
detect_platform() {
  local os arch suffix

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

  if [ "$os" = "linux" ] && [ "$arch" = "amd64" ]; then
    suffix="${os}-${arch}"
  elif [ "$os" = "linux" ] && [ "$arch" = "arm64" ]; then
    suffix="${os}-${arch}"
  elif [ "$os" = "darwin" ] && [ "$arch" = "amd64" ]; then
    suffix="${os}-${arch}"
  elif [ "$os" = "darwin" ] && [ "$arch" = "arm64" ]; then
    suffix="${os}-${arch}"
  fi

  echo "$suffix"
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

  step 4 "Installing better-edit-tools..."
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

  step 5 "Registering plugin in OpenCode..."
  mkdir -p "$(dirname "${OPENCODE_CONFIG}")"

  local plugin_path="${INSTALL_DIR}"

  if [ -f "${OPENCODE_CONFIG}" ]; then
    # Check if already registered
    if grep -q "${plugin_path}" "${OPENCODE_CONFIG}" 2>/dev/null; then
      info "Plugin already registered in ${OPENCODE_CONFIG}"
    else
      # Try to add plugin to existing config using jq if available
      if command -v jq &>/dev/null; then
        local tmp
        tmp="$(mktemp)"
        jq --arg plugin "${plugin_path}" \
          '.plugin += [$plugin]' \
          "${OPENCODE_CONFIG}" > "${tmp}" \
          && mv "${tmp}" "${OPENCODE_CONFIG}"
        ok "Plugin added to ${OPENCODE_CONFIG}"
      else
        echo ""
        warn "Please add this to your ${OPENCODE_CONFIG}:"
        echo "  ${BLUE}\"plugin\": [\"file://${plugin_path}\"]${NC}"
        echo ""
      fi
    fi
  else
    echo '{}' > "${OPENCODE_CONFIG}"
    local tmp
    tmp="$(mktemp)"
    jq --arg plugin "${plugin_path}" \
      '.plugin += [$plugin]' \
      "${OPENCODE_CONFIG}" > "${tmp}" \
      && mv "${tmp}" "${OPENCODE_CONFIG}"
    ok "Created ${OPENCODE_CONFIG} with plugin entry"
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
