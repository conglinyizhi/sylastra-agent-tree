#!/usr/bin/env bun
import { doctor, parseDoctorArgs } from './doctor';
import { install } from './install';
import {
  getGeneratedPresetNames,
  isGeneratedPresetName,
  SINGLE_MODEL_PRESET,
  TRI_MODEL_PRESET,
} from './providers';
import type { BooleanArg, InstallArgs } from './types';

function parseArgs(args: string[]): InstallArgs {
  const result: InstallArgs = {
    tui: true,
    skills: 'yes',
  };

  for (const arg of args) {
    if (arg === '--no-tui') {
      result.tui = false;
    } else if (arg.startsWith('--skills=')) {
      result.skills = arg.split('=')[1] as BooleanArg;
    } else if (arg.startsWith('--preset=')) {
      const preset = arg.split('=')[1];
      if (!isGeneratedPresetName(preset)) {
        console.error(
          `Unsupported preset: ${preset}. Available presets: ${getGeneratedPresetNames().join(', ')}`,
        );
        process.exit(1);
      }
      result.preset = preset;
    } else if (arg.startsWith('--model=')) {
      result.model = arg.slice('--model='.length).trim();
    } else if (arg.startsWith('--fast-model=')) {
      result.fastModel = arg.slice('--fast-model='.length).trim();
    } else if (arg.startsWith('--strong-model=')) {
      result.strongModel = arg.slice('--strong-model='.length).trim();
    } else if (arg.startsWith('--vision-model=')) {
      result.visionModel = arg.slice('--vision-model='.length).trim();
    } else if (arg === '--skip-config') {
      result.skipConfig = true;
    } else if (arg === '--skip-plugin-register') {
      result.skipPluginRegister = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--reset') {
      result.reset = true;
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
sylastra-agent-tree installer

Usage:
  ./install.sh
  node dist/cli/index.js install [OPTIONS]
  node dist/cli/index.js doctor [OPTIONS]

Options:
  --skills=yes|no        Install bundled skills (default: yes)
  --preset=<name>        Active generated config preset (default: openai)
  --model=<id>           Generate and activate the fixed ${SINGLE_MODEL_PRESET} preset
  --fast-model=<id>      Cheap/high-frequency model for explorer/librarian/fixer
  --strong-model=<id>    Strong model for orchestrator/oracle/council
  --vision-model=<id>    Vision-capable model for designer/observer
  --skip-config          Skip writing sylastra-agent-tree config
  --skip-plugin-register Skip writing OpenCode plugin array
  --no-tui               Non-interactive mode
  --dry-run              Simulate install without writing files
  --reset                Force overwrite of existing configuration
  -h, --help             Show this help message

Doctor options:
  --json                 Print diagnostics as JSON

Available presets: ${getGeneratedPresetNames().join(', ')}

The installer generates OpenAI and OpenCode Go presets by default.
OpenAI is active unless --preset selects another generated preset.
Use --model to create a fully runnable single-model config during install.
Use any of --fast-model / --strong-model / --vision-model to create the fixed ${TRI_MODEL_PRESET} preset.
For the full config reference, see docs/configuration.md.

Examples:
  ./install.sh
  node dist/cli/index.js install --no-tui --skills=yes
  node dist/cli/index.js install --preset=opencode-go
  node dist/cli/index.js install --model=openai/gpt-5.5
  node dist/cli/index.js install --fast-model=deepseek/deepseek-v4-flash --strong-model=deepseek/deepseek-v4-pro --vision-model=xiaomi/mimo-v2-omni
  node dist/cli/index.js install --reset
  node dist/cli/index.js doctor
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'install') {
    const hasSubcommand = args[0] === 'install';
    const installArgs = parseArgs(args.slice(hasSubcommand ? 1 : 0));
    const hasTriModels = Boolean(
      installArgs.fastModel ||
        installArgs.strongModel ||
        installArgs.visionModel,
    );
    if (
      (installArgs.preset && installArgs.model) ||
      (installArgs.preset && hasTriModels) ||
      (installArgs.model && hasTriModels)
    ) {
      console.error(
        '--preset, --model, and the tri-model flags cannot be used together',
      );
      process.exit(1);
    }
    if (installArgs.model === '') {
      console.error('--model requires a non-empty model id');
      process.exit(1);
    }
    if (installArgs.fastModel === '') {
      console.error('--fast-model requires a non-empty model id');
      process.exit(1);
    }
    if (installArgs.strongModel === '') {
      console.error('--strong-model requires a non-empty model id');
      process.exit(1);
    }
    if (installArgs.visionModel === '') {
      console.error('--vision-model requires a non-empty model id');
      process.exit(1);
    }
    const exitCode = await install(installArgs);
    process.exit(exitCode);
  } else if (args[0] === 'doctor') {
    const doctorArgs = parseDoctorArgs(args.slice(1));
    const exitCode = await doctor(doctorArgs);
    process.exit(exitCode);
  } else if (args[0] === '-h' || args[0] === '--help') {
    printHelp();
    process.exit(0);
  } else {
    console.error(`Unknown command: ${args[0]}`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
