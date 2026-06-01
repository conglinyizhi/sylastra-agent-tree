# Installation Guide

Complete installation instructions for sylastra-agent-tree.

## Table of Contents

- [For Humans](#for-humans)
- [For LLM Agents](#for-llm-agents)
- [Troubleshooting](#troubleshooting)
- [Uninstallation](#uninstallation)

---

## For Humans

### Quick Install

Download the latest release artifact from GitHub Releases, extract it, then run:

```bash
./install.sh
```

If you want to call the bundled CLI installer directly from the extracted
release artifact, use:

```bash
node dist/cli/index.js install
```

### Configuration Options

The installer supports the following options:

| Option | Description |
|--------|-------------|
| `--skills=yes|no` | Install bundled skills (default: yes) |
| `--preset=<name>` | Active generated config preset: `openai` or `opencode-go` (default: `openai`) |
| `--model=<id>` | Generate and activate a `single-model` preset for all agents |
| `--skip-config` | Install/register plugin without writing `sylastra-agent-tree.json` |
| `--skip-plugin-register` | Generate plugin config only, without writing OpenCode `plugin` array |
| `--no-tui` | Non-interactive mode |
| `--dry-run` | Simulate install without writing files |
| `--reset` | Force overwrite of existing configuration |

`--preset` and `--model` are mutually exclusive.

### Non-Destructive Behavior

By default, the installer is non-destructive. If an `sylastra-agent-tree.json` configuration file already exists, the installer will **not** overwrite it. Instead, it will display a message:

```
[i] Configuration already exists at ~/.config/opencode/sylastra-agent-tree.json. Use --reset to overwrite.
```

To force overwrite of your existing configuration, use the `--reset` flag with
the bundled CLI installer:

```bash
node dist/cli/index.js install --reset
```

**Note:** When using `--reset`, the installer creates a `.bak` backup file before overwriting, so your previous configuration is preserved.

### After Installation

The installer generates both OpenAI and OpenCode Go presets, with OpenAI active by default (using `gpt-5.5` and `gpt-5.4-mini` models). To make OpenCode Go active during install, run:

```bash
node dist/cli/index.js install --preset=opencode-go
```

If you want a first-run config that is immediately consistent across all agents, run:

```bash
node dist/cli/index.js install --model=openai/gpt-5.5
```

That creates and activates a `single-model` preset covering all default agents, including `observer` and `council` when present.

Then:

```bash
opencode auth login
# Select your provider and complete OAuth flow
```

```bash
opencode models --refresh
```

Open your generated config at `~/.config/opencode/sylastra-agent-tree.json`
and adjust models if needed. Plugin registration is written to OpenCode config
using the `file://` path format for local installs.

### Release Artifact Layout

`bun run build:release` now assembles a self-contained `release-artifact/`
directory. It contains:

- `package.json`
- `VERSION`
- `artifact-manifest.json`
- `dist/`
- `src/skills/`
- `sylastra-agent-tree.schema.json`
- runtime `node_modules/`

Validate it with:

```bash
bun run verify:release
```

Then run OpenCode and verify the agents:

```text
ping all agents
```

> **💡 Tip: Models are fully customizable.** The installer sets sensible defaults, but you can assign *any* model to *any* agent. Edit `~/.config/opencode/sylastra-agent-tree.json` (or `.jsonc` for comments support) to override models, adjust reasoning effort, or disable agents entirely.

### Alternative: Ask Any Coding Agent

Paste this into Claude Code, AmpCode, Cursor, or any coding agent:

```
Install and configure by following the instructions here:
https://raw.githubusercontent.com/conglinyizhi/sylastra-agent-tree/refs/heads/main/README.md
```

---

## For LLM Agents

If you're an LLM Agent helping set up sylastra-agent-tree, follow these steps.

### Step 1: Check OpenCode Installation

```bash
opencode --version
```

If not installed, direct the user to https://opencode.ai/docs first.

### Step 2: Run the Installer

The installer generates OpenAI and OpenCode Go presets, with OpenAI active by default:

```bash
node dist/cli/index.js install --no-tui --skills=yes
```

**Examples:**
```bash
# Run from the extracted release artifact directory
./install.sh

# Make the generated OpenCode Go preset active
node dist/cli/index.js install --preset=opencode-go

# Generate a single-model preset for all agents
node dist/cli/index.js install --model=openai/gpt-5.5

# Non-interactive without skills
node dist/cli/index.js install --no-tui --skills=no

# Install plugin but keep existing sylastra-agent-tree config untouched
node dist/cli/index.js install --skip-config

# Generate plugin config without modifying OpenCode plugin array
node dist/cli/index.js install --skip-plugin-register

# Force overwrite existing configuration
node dist/cli/index.js install --reset
```

The installer automatically:
- Adds the plugin to `~/.config/opencode/opencode.json` or `.jsonc`
- Disables default OpenCode agents
- Enables OpenCode LSP integration when no explicit `lsp` setting exists
- Generates agent model mappings in `~/.config/opencode/sylastra-agent-tree.json` (or `.jsonc`)
- Uses `file://` for local plugin registration entries

### Step 3: Authenticate with Providers

Ask user to run the following command. Don't run it yourself, it requires user interaction.

```bash
opencode auth login
# Select your provider and complete OAuth flow
```

### Step 4: Verify Installation

Ask the user to:

1. Authenticate: `opencode auth login`
2. Refresh models: `opencode models --refresh`
3. Start OpenCode: `opencode`
4. Run: `ping all agents`

Verify all agents respond successfully.

**Crucial Advice for the User:**
- They can easily assign **different models to different agents** by editing `~/.config/opencode/sylastra-agent-tree.json` (or `.jsonc`).
- If they want to add a different provider later (OpenCode Go, Kimi, GitHub Copilot, ZAI), they can update this file manually. See **[Configuration Reference](configuration.md)** and the preset docs for examples.
- Read the generated `~/.config/opencode/sylastra-agent-tree.json` (or `.jsonc`) file to understand the current configuration.

---

## Troubleshooting

### Installer Fails

Check the expected config format:
```bash
node dist/cli/index.js install --help
```

Then manually create the config files at:
- `~/.config/opencode/sylastra-agent-tree.json` (or `.jsonc`)

### Configuration Already Exists

If the installer reports that the configuration already exists, you have two options:

1. **Keep existing config**: The installer will skip the configuration step and continue with other operations (like adding the plugin or installing skills).

2. **Reset configuration**: Use `--reset` to overwrite:
   ```bash
   node dist/cli/index.js install --reset
   ```
   A `.bak` backup file will be created automatically.

### Agents Not Responding

1. Check your authentication:
   ```bash
   opencode auth status
   ```

2. From your project root, verify your config file exists and is valid:
   ```bash
   node dist/cli/index.js doctor
   ```

3. Check that your provider is configured in `~/.config/opencode/opencode.json`

### Authentication Issues

If providers are not working:

1. Check your authentication status:
   ```bash
   opencode auth status
   ```

2. Re-authenticate if needed:
   ```bash
   opencode auth login
   ```

3. Verify your config file has the correct provider configuration:
   ```bash
   cat ~/.config/opencode/sylastra-agent-tree.json
   ```

### Editor Validation

Add a `$schema` reference to your config for autocomplete and inline validation:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/conglinyizhi/sylastra-agent-tree/main/sylastra-agent-tree.schema.json",
  // your config...
}
```

Works in VS Code, Neovim (with `jsonls`), and any editor that supports JSON Schema. Catches typos and wrong nesting immediately.

### Tmux Integration Not Working

Make sure you're running OpenCode with the `--port` flag and the port matches your `OPENCODE_PORT` environment variable:

```bash
tmux
export OPENCODE_PORT=4096
opencode --port 4096
```

See the [Multiplexer Integration Guide](multiplexer-integration.md) for more details.

---

## Uninstallation

1. **Remove the plugin from your OpenCode config**:

   Edit `~/.config/opencode/opencode.json` and remove `"sylastra-agent-tree"` from the `plugin` array.

2. **Remove configuration files (optional)**:
   ```bash
   rm -f ~/.config/opencode/sylastra-agent-tree.json
   rm -f ~/.config/opencode/sylastra-agent-tree.json.bak
   ```

3. **Remove skills (optional)**:
   ```bash
   rm -rf ~/.config/opencode/skills/simplify
   rm -rf ~/.config/opencode/skills/codemap
   rm -rf ~/.config/opencode/skills/clonedeps
   ```
