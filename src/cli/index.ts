#!/usr/bin/env bun
import { doctor, parseDoctorArgs } from './doctor';
import { install } from './install';
import {
  getGeneratedPresetNames,
  isGeneratedPresetName,
  SINGLE_MODEL_PRESET,
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
  bunx sylastra-agent-tree install [OPTIONS]
  bunx sylastra-agent-tree doctor [OPTIONS]

Options:
  --skills=yes|no        Install bundled skills (default: yes)
  --preset=<name>        Active generated config preset (default: openai)
  --model=<id>           Generate and activate the fixed ${SINGLE_MODEL_PRESET} preset
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
For the full config reference, see docs/configuration.md.

Examples:
  bunx sylastra-agent-tree install
  bunx sylastra-agent-tree install --no-tui --skills=yes
  bunx sylastra-agent-tree install --preset=opencode-go
  bunx sylastra-agent-tree install --model=openai/gpt-5.5
  bunx sylastra-agent-tree install --reset
  bunx sylastra-agent-tree doctor
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'install') {
    const hasSubcommand = args[0] === 'install';
    const installArgs = parseArgs(args.slice(hasSubcommand ? 1 : 0));
    if (installArgs.preset && installArgs.model) {
      console.error('--preset and --model cannot be used together');
      process.exit(1);
    }
    if (installArgs.model === '') {
      console.error('--model requires a non-empty model id');
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
