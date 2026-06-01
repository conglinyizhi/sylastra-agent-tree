import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const artifactDir = path.join(repoRoot, 'release-artifact');
const bundlesDir = path.join(repoRoot, 'release-bundles');

const suspiciousPathPatterns = [
  /\/Users\/[^\s'"`]+(?:node_modules|sylastra-agent-tree)[^\s'"`]*/,
  /\/home\/[^\s'"`]+(?:node_modules|sylastra-agent-tree)[^\s'"`]*/,
];
const suspiciousImportPatterns = [/from\s+["']vscode-jsonrpc\/node["']/];

const packagedRequiredFiles = [
  'package.json',
  'VERSION',
  'artifact-manifest.json',
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/cli/index.js',
  'bin/sylastra-updater',
  `bin/better-edit-tools-${resolveCurrentPlatform()}`,
  'sylastra-agent-tree.schema.json',
  'src/skills/simplify/SKILL.md',
  'src/skills/codemap/SKILL.md',
  'src/skills/clonedeps/SKILL.md',
  'node_modules/zod/package.json',
];

function resolveCurrentPlatform(): string {
  const archMap: Record<string, string> = {
    x64: 'amd64',
    arm64: 'arm64',
  };
  const mappedArch = archMap[process.arch];
  if (!mappedArch) {
    fail(`unsupported current arch for verification: ${process.arch}`);
  }
  return `${process.platform}-${mappedArch}`;
}

function fail(message: string): never {
  throw new Error(message);
}

function run(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n');
    fail(
      `Command failed: ${command} ${args.join(' ')}${detail ? `\n${detail}` : ''}`,
    );
  }

  return result.stdout.trim();
}

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    return [fullPath];
  });
}

function verifyDistHasNoLeakedPaths() {
  console.log('Checking dist for leaked machine paths...');
  const files = walkFiles(distDir).filter((file) =>
    /\.(?:js|d\.ts|map|json)$/.test(file),
  );

  const leaks: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of suspiciousPathPatterns) {
      const match = content.match(pattern);
      if (!match) continue;
      leaks.push(`${path.relative(repoRoot, file)}: ${match[0]}`);
    }
    for (const pattern of suspiciousImportPatterns) {
      const match = content.match(pattern);
      if (!match) continue;
      leaks.push(`${path.relative(repoRoot, file)}: ${match[0]}`);
    }
  }

  if (leaks.length > 0) {
    fail(
      `Built artifact contains machine-specific paths:\n${leaks.join('\n')}`,
    );
  }
}

function verifyArtifactLayout() {
  console.log('Checking release artifact layout...');
  for (const requiredFile of packagedRequiredFiles) {
    if (!existsSync(path.join(artifactDir, requiredFile))) {
      fail(`release artifact is missing required file: ${requiredFile}`);
    }
  }
}

function verifyArtifactMetadata() {
  const packageJson = JSON.parse(
    readFileSync(path.join(artifactDir, 'package.json'), 'utf8'),
  ) as { version?: string; scripts?: Record<string, string> };
  const version = readFileSync(
    path.join(artifactDir, 'VERSION'),
    'utf8',
  ).trim();
  const manifest = JSON.parse(
    readFileSync(path.join(artifactDir, 'artifact-manifest.json'), 'utf8'),
  ) as { version?: string };

  if (packageJson.version !== version) {
    fail(
      `VERSION mismatch: package.json=${packageJson.version} VERSION=${version}`,
    );
  }
  if (manifest.version !== version) {
    fail(
      `artifact-manifest mismatch: manifest=${manifest.version} VERSION=${version}`,
    );
  }
  if (packageJson.scripts) {
    fail('release artifact package.json must not include scripts');
  }
}

function verifyReleaseBundle() {
  const manifestPath = path.join(bundlesDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail('release bundle manifest.json is missing');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    stable?: {
      version?: string;
      artifacts?: Record<
        string,
        {
          url?: string;
          sha256?: string;
        }
      >;
    };
  };
  const artifacts = manifest.stable?.artifacts ?? {};
  const expectedPlatforms = [
    'linux-amd64',
    'linux-arm64',
    'darwin-amd64',
    'darwin-arm64',
  ];
  for (const platform of expectedPlatforms) {
    const artifact = artifacts[platform];
    if (!artifact?.url?.startsWith('file://')) {
      fail(
        `release bundle manifest ${platform} url must use file:// for local verification`,
      );
    }
    const archivePath = artifact.url.replace('file://', '');
    if (!existsSync(archivePath)) {
      fail(`release archive missing for ${platform}: ${archivePath}`);
    }
    if (!artifact.sha256 || artifact.sha256.length !== 64) {
      fail(`release archive sha256 missing or malformed for ${platform}`);
    }
  }

  const sumsPath = path.join(bundlesDir, 'SHA256SUMS');
  if (!existsSync(sumsPath)) {
    fail('release SHA256SUMS is missing');
  }
}

function verifyMinimalLoads() {
  console.log('Importing release artifact entrypoints...');
  run(
    'node',
    ['--input-type=module', '--eval', "await import('./dist/index.js')"],
    { cwd: artifactDir },
  );
  console.log('Checking CLI entrypoint syntax without executing installer...');
  run('node', ['--check', './dist/cli/index.js'], { cwd: artifactDir });
}

function main() {
  verifyDistHasNoLeakedPaths();
  verifyArtifactLayout();
  verifyArtifactMetadata();
  verifyReleaseBundle();
  verifyMinimalLoads();
  console.log('Release artifact verification passed.');
}

main();
