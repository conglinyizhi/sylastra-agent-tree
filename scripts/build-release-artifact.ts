import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type PackageJson = {
  name: string;
  version: string;
  description?: string;
  type?: string;
  license?: string;
  main?: string;
  types?: string;
  exports?: Record<string, unknown>;
  bin?: Record<string, string>;
  repository?: Record<string, unknown>;
  bugs?: Record<string, unknown>;
  homepage?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type BuiltUpdaterBinary = {
  platform: string;
  binaryPath: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const artifactRoot = path.join(repoRoot, 'release-artifact');
const releaseBundlesRoot = path.join(repoRoot, 'release-bundles');
const updaterRoot = path.join(repoRoot, 'updater');
const runtimeDependencyRoots = [
  '@mozilla/readability',
  'jsdom',
  'lru-cache',
  'turndown',
  'zod',
];
const supportedUpdaterTargets = [
  { platform: 'linux-amd64', goos: 'linux', goarch: 'amd64' },
  { platform: 'linux-arm64', goos: 'linux', goarch: 'arm64' },
  { platform: 'darwin-amd64', goos: 'darwin', goarch: 'amd64' },
  { platform: 'darwin-arm64', goos: 'darwin', goarch: 'arm64' },
] as const;

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function ensureCleanDir(dir: string) {
  rmSync(dir, { force: true, recursive: true });
  mkdirSync(dir, { recursive: true });
}

function copyIfExists(relativePath: string) {
  const source = path.join(repoRoot, relativePath);
  if (!existsSync(source)) {
    return;
  }

  const target = path.join(artifactRoot, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  const stats = statSync(source);
  if (stats.isDirectory()) {
    cpSync(source, target, { recursive: true });
  } else {
    copyFileSync(source, target);
  }
}

function collectDependencyClosure(
  packageName: string,
  collected = new Set<string>(),
): Set<string> {
  if (collected.has(packageName)) {
    return collected;
  }

  const packageDir = path.join(repoRoot, 'node_modules', packageName);
  if (!existsSync(packageDir)) {
    throw new Error(
      `Missing runtime dependency in node_modules: ${packageName}`,
    );
  }

  collected.add(packageName);
  const pkg = readJson<PackageJson>(path.join(packageDir, 'package.json'));
  const nextDeps = Object.keys(pkg.dependencies ?? {});
  const nextOptionalDeps = Object.keys(pkg.optionalDependencies ?? {});

  for (const dep of [...nextDeps, ...nextOptionalDeps]) {
    collectDependencyClosure(dep, collected);
  }

  return collected;
}

function copyDependencyTree(packageName: string) {
  const sourceDir = path.join(repoRoot, 'node_modules', packageName);
  const targetDir = path.join(artifactRoot, 'node_modules', packageName);
  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

function createReleasePackageJson(sourcePkg: PackageJson) {
  const releasePkg = {
    name: sourcePkg.name,
    version: sourcePkg.version,
    description: sourcePkg.description,
    type: sourcePkg.type,
    license: sourcePkg.license,
    main: sourcePkg.main,
    types: sourcePkg.types,
    exports: sourcePkg.exports,
    bin: sourcePkg.bin,
    repository: sourcePkg.repository,
    bugs: sourcePkg.bugs,
    homepage: sourcePkg.homepage,
    keywords: sourcePkg.keywords,
    dependencies: Object.fromEntries(
      runtimeDependencyRoots
        .filter((name) => sourcePkg.dependencies?.[name])
        .map((name) => [name, sourcePkg.dependencies?.[name] ?? '']),
    ),
  };

  writeFileSync(
    path.join(artifactRoot, 'package.json'),
    `${JSON.stringify(releasePkg, null, 2)}\n`,
  );
}

function writeArtifactMetadata(version: string) {
  writeFileSync(path.join(artifactRoot, 'VERSION'), `${version}\n`);
  writeFileSync(
    path.join(artifactRoot, 'artifact-manifest.json'),
    `${JSON.stringify(
      {
        name: 'sylastra-agent-tree',
        version,
        generatedAt: new Date().toISOString(),
        files: [
          'package.json',
          'VERSION',
          'artifact-manifest.json',
          'dist',
          'src/skills',
          'sylastra-agent-tree.schema.json',
          'README.md',
          'README.zh-CN.md',
          'LICENSE',
          'node_modules',
          'bin',
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function buildUpdaterBinaries(version: string): BuiltUpdaterBinary[] {
  const outputRoot = path.join(releaseBundlesRoot, 'updater-bin', version);
  rmSync(outputRoot, { force: true, recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  const built: BuiltUpdaterBinary[] = [];

  for (const target of supportedUpdaterTargets) {
    const targetDir = path.join(outputRoot, target.platform);
    mkdirSync(targetDir, { recursive: true });
    const binaryPath = path.join(targetDir, 'sylastra-updater');
    const result = spawnSync(
      'go',
      ['build', '-o', binaryPath, './cmd/sylastra-updater'],
      {
        cwd: updaterRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CGO_ENABLED: '0',
          GOOS: target.goos,
          GOARCH: target.goarch,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    if (result.status !== 0) {
      throw new Error(
        result.stderr || `failed to build updater for ${target.platform}`,
      );
    }

    chmodSync(binaryPath, 0o755);
    built.push({ platform: target.platform, binaryPath });
  }

  return built;
}

function resolveCurrentPlatform(): string {
  const archMap: Record<string, string> = {
    x64: 'amd64',
    arm64: 'arm64',
  };
  const mappedArch = archMap[process.arch];
  if (!mappedArch) {
    throw new Error(
      `unsupported current arch for updater packaging: ${process.arch}`,
    );
  }
  return `${process.platform}-${mappedArch}`;
}

function copyCurrentPlatformUpdater(binaries: BuiltUpdaterBinary[]) {
  const currentPlatform = resolveCurrentPlatform();
  const match = binaries.find((item) => item.platform === currentPlatform);
  if (!match) {
    throw new Error(
      `no updater binary built for current platform ${currentPlatform}`,
    );
  }

  const binDir = path.join(artifactRoot, 'bin');
  mkdirSync(binDir, { recursive: true });
  const targetPath = path.join(binDir, 'sylastra-updater');
  copyFileSync(match.binaryPath, targetPath);
  chmodSync(targetPath, 0o755);
}

function createTarball(
  version: string,
  platform: string,
): {
  archivePath: string;
  sha256: string;
} {
  mkdirSync(releaseBundlesRoot, { recursive: true });

  const archiveName = `sylastra-agent-tree-${version}-${platform}.tar.gz`;
  const archivePath = path.join(releaseBundlesRoot, archiveName);
  const result = spawnSync(
    'tar',
    ['-czf', archivePath, path.basename(artifactRoot)],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || 'failed to create tarball');
  }

  return {
    archivePath,
    sha256: sha256File(archivePath),
  };
}

function writeReleaseManifest(
  version: string,
  archives: Array<{ platform: string; archiveName: string; sha256: string }>,
) {
  const manifestPath = path.join(releaseBundlesRoot, 'manifest.json');
  const artifacts = Object.fromEntries(
    archives.map(({ platform, archiveName, sha256 }) => [
      platform,
      {
        url: `file://${path.join(releaseBundlesRoot, archiveName)}`,
        sha256,
      },
    ]),
  );

  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        stable: {
          version,
          artifacts,
        },
      },
      null,
      2,
    )}\n`,
  );
}

function writeShaSums(
  archives: Array<{ archiveName: string; sha256: string }>,
) {
  writeFileSync(
    path.join(releaseBundlesRoot, 'SHA256SUMS'),
    `${archives
      .map(({ archiveName, sha256 }) => `${sha256}  ${archiveName}`)
      .join('\n')}\n`,
  );
}

function main() {
  const sourcePkg = readJson<PackageJson>(path.join(repoRoot, 'package.json'));

  rmSync(releaseBundlesRoot, { force: true, recursive: true });
  ensureCleanDir(artifactRoot);
  createReleasePackageJson(sourcePkg);
  writeArtifactMetadata(sourcePkg.version);

  for (const entry of [
    'dist',
    'src/skills',
    'sylastra-agent-tree.schema.json',
    'README.md',
    'README.zh-CN.md',
    'LICENSE',
  ]) {
    copyIfExists(entry);
  }

  const runtimeDeps = new Set<string>();
  for (const packageName of runtimeDependencyRoots) {
    collectDependencyClosure(packageName, runtimeDeps);
  }

  const sortedDeps = [...runtimeDeps].sort((a, b) => a.localeCompare(b));
  mkdirSync(path.join(artifactRoot, 'node_modules'), { recursive: true });
  for (const dep of sortedDeps) {
    copyDependencyTree(dep);
  }

  const builtUpdaterBinaries = buildUpdaterBinaries(sourcePkg.version);
  copyCurrentPlatformUpdater(builtUpdaterBinaries);

  const binDir = path.join(artifactRoot, 'bin');
  for (const entry of readdirSync(repoRoot)) {
    if (!entry.startsWith('better-edit-tools-')) continue;
    copyFileSync(path.join(repoRoot, entry), path.join(binDir, entry));
  }

  console.log(
    `Release artifact assembled at ${path.relative(repoRoot, artifactRoot)}`,
  );

  const archives = builtUpdaterBinaries.map(({ platform, binaryPath }) => {
    const artifactUpdaterPath = path.join(
      artifactRoot,
      'bin',
      'sylastra-updater',
    );
    copyFileSync(binaryPath, artifactUpdaterPath);
    chmodSync(artifactUpdaterPath, 0o755);
    const { archivePath, sha256 } = createTarball(sourcePkg.version, platform);
    return {
      platform,
      archiveName: path.basename(archivePath),
      sha256,
    };
  });

  writeReleaseManifest(sourcePkg.version, archives);
  writeShaSums(archives);
}

main();
