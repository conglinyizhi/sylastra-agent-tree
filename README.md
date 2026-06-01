# sylastra-agent-tree

English | [简体中文](README.zh-CN.md)

`sylastra-agent-tree` is an OpenCode plugin for multi-agent orchestration. It
ships a built-in orchestrator plus specialist agents for codebase exploration,
documentation lookup, implementation, review, and UI work.

This project is a fork of
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) and
is now released through GitHub Releases only. Local installation and updates
use a self-contained release artifact workflow.

## What It Provides

- An orchestrator that routes work to specialist agents
- Bundled agent presets and plugin configuration generation
- Built-in skills and MCP integration shipped inside the release artifact
- Interview, council, and task-session workflows for larger jobs
- Artifact-based automatic update checks with prepare, activate, healthcheck,
  and rollback support

## Installation

Download the latest release artifact from
[GitHub Releases](https://github.com/conglinyizhi/sylastra-agent-tree/releases),
extract it, then run:

```bash
./install.sh
```

`./install.sh` is the supported install entrypoint for normal users.

The installer:

- registers the plugin with a local `file://` path
- writes `~/.config/opencode/sylastra-agent-tree.json` unless you skip config
- can generate either bundled presets or a single-model preset
- keeps release installs aligned with the packaged artifact layout

The packaged Go updater is not the first-install tool. Its job is release
lifecycle management after installation: prepare, activate, healthcheck,
rollback, and cleanup. Initial OpenCode integration and plugin-config
generation still live in the bundled CLI because they share the same preset,
schema, JSONC, and skill-install logic as the plugin itself.

Advanced or debugging use only:

```bash
node dist/cli/index.js install
```

Useful options:

```bash
node dist/cli/index.js install --preset=opencode-go
node dist/cli/index.js install --model=openai/gpt-5.5
node dist/cli/index.js install --skip-config
node dist/cli/index.js install --skip-plugin-register
node dist/cli/index.js install --reset
```

`--preset` and `--model` are mutually exclusive. `--model` generates and
activates a `single-model` preset for all default agents.

Full install details are in [docs/installation.md](docs/installation.md).

## After Install

1. Authenticate your providers:

   ```bash
   opencode auth login
   ```

2. Refresh available models:

   ```bash
   opencode models --refresh
   ```

3. Start OpenCode and verify the plugin:

   ```text
   ping all agents
   ```

The generated config defaults to bundled presets. Adjust models in
`~/.config/opencode/sylastra-agent-tree.json` as needed, or install with
`--model=<provider/model>` if you want a ready-to-run first-run setup without
editing the file.

## Automatic Updates

The plugin checks for new release artifacts on startup.

- Local `file://` development installs are treated as dev mode and do not
  auto-update
- Pinned plugin entries stay pinned
- Default update policy prepares the next version in the background and
  activates it on the next startup
- Failed activation healthchecks trigger automatic rollback

Set notification-only mode with:

```jsonc
{
  "autoUpdate": false
}
```

Object mode is also supported:

```jsonc
{
  "autoUpdate": {
    "enabled": true,
    "policy": "prepare",
    "channel": "stable",
    "manifestUrl": "https://github.com/conglinyizhi/sylastra-agent-tree/releases/latest/download/manifest.json",
    "cohort": "default"
  }
}
```

See [docs/configuration.md](docs/configuration.md) for the full update and
runtime configuration reference.

## Release Artifact

Each GitHub release ships a self-contained artifact that includes:

- `dist/`
- `src/skills/`
- `package.json`
- `VERSION`
- `artifact-manifest.json`
- `sylastra-agent-tree.schema.json`
- runtime dependencies
- the platform-matched updater and bundled helper binaries

The updater is compiled in CI for supported platforms and packaged directly into
the release artifact, so end users do not need to build Go code locally.

## Agent Overview

Built-in agents include:

- `orchestrator`: main coordinator and delegator
- `oracle`: higher-judgment review and architecture work
- `explorer`: fast repository reconnaissance
- `librarian`: documentation and web lookup
- `designer`: UI and frontend-oriented tasks
- `fixer`: scoped implementation and repair work
- `council` and `observer`: optional workflows depending on config

Agent prompts and behavior live under [src/agents](src/agents).

## Configuration

Main user-facing config files:

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/sylastra-agent-tree.json`
- `.opencode/sylastra-agent-tree.json`

The plugin supports:

- named presets
- per-agent model selection
- custom agents
- MCP allow/deny controls
- multiplexer settings
- council presets
- interview settings
- fallback chains
- auto-update policy

Start with [docs/configuration.md](docs/configuration.md).

## Development

Common commands:

```bash
bun run build
bun run check:ci
bun run typecheck
bun test
bun run build:release
bun run verify:release
```

The release pipeline builds the TypeScript artifact, compiles the Go updater in
CI, packages platform-specific helper binaries, generates checksums and release
manifests, and verifies the final artifact before publishing.

## License

MIT.
