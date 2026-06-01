import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
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

type PlatformTarget = {
  platform: string;
  goos: 'linux' | 'darwin' | 'windows';
  goarch: 'amd64' | 'arm64';
  releaseEnabled: boolean;
  updaterEnabled: boolean;
  betterEditToolsEnabled: boolean;
  betterEditToolsArchive: {
    assetName: string;
    type: 'tar.gz' | 'zip';
    extractedBinaryName: string;
    packagedBinaryName: string;
  };
};

type DownloadedBetterEditToolsBinary = {
  platform: string;
  binaryPath: string;
  packagedBinaryName: string;
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
const platformTargets: PlatformTarget[] = [
  {
    platform: 'linux-amd64',
    goos: 'linux',
    goarch: 'amd64',
    releaseEnabled: true,
    updaterEnabled: true,
    betterEditToolsEnabled: true,
    betterEditToolsArchive: {
      assetName: 'better-edit-tools-linux-amd64.tar.gz',
      type: 'tar.gz',
      extractedBinaryName: 'better-edit-tools',
      packagedBinaryName: 'better-edit-tools-linux-amd64',
    },
  },
  {
    platform: 'linux-arm64',
    goos: 'linux',
    goarch: 'arm64',
    releaseEnabled: true,
    updaterEnabled: true,
    betterEditToolsEnabled: true,
    betterEditToolsArchive: {
      assetName: 'better-edit-tools-linux-arm64.tar.gz',
      type: 'tar.gz',
      extractedBinaryName: 'better-edit-tools',
      packagedBinaryName: 'better-edit-tools-linux-arm64',
    },
  },
  {
    platform: 'darwin-amd64',
    goos: 'darwin',
    goarch: 'amd64',
    releaseEnabled: true,
    updaterEnabled: true,
    betterEditToolsEnabled: true,
    betterEditToolsArchive: {
      assetName: 'better-edit-tools-darwin-amd64.tar.gz',
      type: 'tar.gz',
      extractedBinaryName: 'better-edit-tools',
      packagedBinaryName: 'better-edit-tools-darwin-amd64',
    },
  },
  {
    platform: 'darwin-arm64',
    goos: 'darwin',
    goarch: 'arm64',
    releaseEnabled: true,
    updaterEnabled: true,
    betterEditToolsEnabled: true,
    betterEditToolsArchive: {
      assetName: 'better-edit-tools-darwin-arm64.tar.gz',
      type: 'tar.gz',
      extractedBinaryName: 'better-edit-tools',
      packagedBinaryName: 'better-edit-tools-darwin-arm64',
    },
  },
  {
    platform: 'windows-amd64',
    goos: 'windows',
    goarch: 'amd64',
    releaseEnabled: false,
    updaterEnabled: false,
    betterEditToolsEnabled: false,
    betterEditToolsArchive: {
      assetName: 'better-edit-tools-windows-amd64.zip',
      type: 'zip',
      extractedBinaryName: 'better-edit-tools.exe',
      packagedBinaryName: 'better-edit-tools-windows-amd64.exe',
    },
  },
  {
    platform: 'windows-arm64',
    goos: 'windows',
    goarch: 'arm64',
    releaseEnabled: false,
    updaterEnabled: false,
    betterEditToolsEnabled: false,
    betterEditToolsArchive: {
      assetName: 'better-edit-tools-windows-arm64.zip',
      type: 'zip',
      extractedBinaryName: 'better-edit-tools.exe',
      packagedBinaryName: 'better-edit-tools-windows-arm64.exe',
    },
  },
];
const supportedUpdaterTargets = platformTargets.filter(
  (target) => target.updaterEnabled,
);
const releasedPlatformTargets = platformTargets.filter(
  (target) => target.releaseEnabled,
);
const betterEditToolsTargets = platformTargets.filter(
  (target) => target.betterEditToolsEnabled,
);
const betterEditToolsRepo =
  process.env.BET_REPO ?? 'conglinyizhi/better-edit-tools-mcp';
const betterEditToolsVersion = process.env.BET_VERSION ?? 'latest';

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

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    errorMessage?: string;
  } = {},
) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      options.errorMessage ?? (result.stderr || `failed to run ${command}`),
    );
  }

  return result;
}

function downloadBetterEditToolsBinary(
  target: PlatformTarget,
  outputRoot: string,
): DownloadedBetterEditToolsBinary {
  const bundledBinaryPath = path.join(
    repoRoot,
    target.betterEditToolsArchive.packagedBinaryName,
  );
  if (existsSync(bundledBinaryPath)) {
    const targetDir = path.join(outputRoot, target.platform);
    mkdirSync(targetDir, { recursive: true });
    const binaryPath = path.join(
      targetDir,
      target.betterEditToolsArchive.packagedBinaryName,
    );
    copyFileSync(bundledBinaryPath, binaryPath);
    chmodSync(binaryPath, 0o755);
    return {
      platform: target.platform,
      binaryPath,
      packagedBinaryName: target.betterEditToolsArchive.packagedBinaryName,
    };
  }

  const targetDir = path.join(outputRoot, target.platform);
  mkdirSync(targetDir, { recursive: true });

  const archiveUrl =
    betterEditToolsVersion === 'latest'
      ? `https://github.com/${betterEditToolsRepo}/releases/latest/download/${target.betterEditToolsArchive.assetName}`
      : `https://github.com/${betterEditToolsRepo}/releases/download/${betterEditToolsVersion}/${target.betterEditToolsArchive.assetName}`;
  const tempDir = mkdtempSync(
    path.join(os.tmpdir(), `sylastra-bet-${target.platform}-`),
  );

  try {
    const archivePath = path.join(
      tempDir,
      target.betterEditToolsArchive.assetName,
    );
    console.log(`Downloading ${target.betterEditToolsArchive.assetName}...`);
    runCommand('curl', ['-fsSL', archiveUrl, '-o', archivePath], {
      errorMessage: `failed to download ${target.betterEditToolsArchive.assetName} from ${archiveUrl}`,
    });

    if (target.betterEditToolsArchive.type !== 'tar.gz') {
      throw new Error(
        `better-edit-tools archive type ${target.betterEditToolsArchive.type} is reserved for future support on ${target.platform}`,
      );
    }

    runCommand('tar', ['-xzf', archivePath, '-C', tempDir], {
      errorMessage: `failed to extract ${target.betterEditToolsArchive.assetName}`,
    });

    const extractedBinaryPath = path.join(
      tempDir,
      target.betterEditToolsArchive.extractedBinaryName,
    );
    if (!existsSync(extractedBinaryPath)) {
      throw new Error(
        `extracted better-edit-tools binary not found for ${target.platform}: ${extractedBinaryPath}`,
      );
    }

    const binaryPath = path.join(
      targetDir,
      target.betterEditToolsArchive.packagedBinaryName,
    );
    copyFileSync(extractedBinaryPath, binaryPath);
    chmodSync(binaryPath, 0o755);

    return {
      platform: target.platform,
      binaryPath,
      packagedBinaryName: target.betterEditToolsArchive.packagedBinaryName,
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function downloadBetterEditToolsBinaries(
  version: string,
): DownloadedBetterEditToolsBinary[] {
  const outputRoot = path.join(
    releaseBundlesRoot,
    'better-edit-tools-bin',
    version,
  );
  rmSync(outputRoot, { force: true, recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  return betterEditToolsTargets.map((target) =>
    downloadBetterEditToolsBinary(target, outputRoot),
  );
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

function stageArtifactPlatformBinaries(
  updaterBinary: BuiltUpdaterBinary,
  betterEditToolsBinary: DownloadedBetterEditToolsBinary,
) {
  const binDir = path.join(artifactRoot, 'bin');
  ensureCleanDir(binDir);

  const updaterTargetPath = path.join(binDir, 'sylastra-updater');
  copyFileSync(updaterBinary.binaryPath, updaterTargetPath);
  chmodSync(updaterTargetPath, 0o755);

  const betterEditToolsTargetPath = path.join(
    binDir,
    betterEditToolsBinary.packagedBinaryName,
  );
  copyFileSync(betterEditToolsBinary.binaryPath, betterEditToolsTargetPath);
  chmodSync(betterEditToolsTargetPath, 0o755);
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
  const downloadedBetterEditToolsBinaries = downloadBetterEditToolsBinaries(
    sourcePkg.version,
  );
  const currentPlatform = resolveCurrentPlatform();
  const currentUpdaterBinary = builtUpdaterBinaries.find(
    (item) => item.platform === currentPlatform,
  );
  const currentBetterEditToolsBinary = downloadedBetterEditToolsBinaries.find(
    (item) => item.platform === currentPlatform,
  );
  if (!currentUpdaterBinary) {
    throw new Error(
      `no updater binary built for current platform ${currentPlatform}`,
    );
  }
  if (!currentBetterEditToolsBinary) {
    throw new Error(
      `no better-edit-tools binary staged for current platform ${currentPlatform}`,
    );
  }
  stageArtifactPlatformBinaries(
    currentUpdaterBinary,
    currentBetterEditToolsBinary,
  );

  console.log(
    `Release artifact assembled at ${path.relative(repoRoot, artifactRoot)}`,
  );

  const archives = releasedPlatformTargets.map((target) => {
    const updaterBinary = builtUpdaterBinaries.find(
      (item) => item.platform === target.platform,
    );
    const betterEditToolsBinary = downloadedBetterEditToolsBinaries.find(
      (item) => item.platform === target.platform,
    );
    if (!updaterBinary) {
      throw new Error(`missing updater binary for ${target.platform}`);
    }
    if (!betterEditToolsBinary) {
      throw new Error(
        `missing better-edit-tools binary for ${target.platform}`,
      );
    }

    stageArtifactPlatformBinaries(updaterBinary, betterEditToolsBinary);
    const { archivePath, sha256 } = createTarball(
      sourcePkg.version,
      target.platform,
    );
    return {
      platform: target.platform,
      archiveName: path.basename(archivePath),
      sha256,
    };
  });

  stageArtifactPlatformBinaries(
    currentUpdaterBinary,
    currentBetterEditToolsBinary,
  );

  writeReleaseManifest(sourcePkg.version, archives);
  writeShaSums(archives);
}

main();
