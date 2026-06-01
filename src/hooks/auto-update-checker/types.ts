export interface ReleaseManifestVersionEntry {
  version: string;
  notesUrl?: string;
  artifacts?: Record<
    string,
    {
      url: string;
      sha256: string;
    }
  >;
}

export interface ReleaseManifest {
  stable?: ReleaseManifestVersionEntry;
  beta?: ReleaseManifestVersionEntry;
}

export interface OpencodeConfig {
  plugin?: unknown[];
  [key: string]: unknown;
}

export interface PackageJson {
  version: string;
  name?: string;
  [key: string]: unknown;
}

export interface AutoUpdateHealthcheckConfig {
  enabled?: boolean;
}

export interface AutoUpdateRollbackConfig {
  enabled?: boolean;
}

export interface AutoUpdateConfig {
  enabled?: boolean;
  policy?: 'notify' | 'prepare';
  channel?: 'stable' | 'beta';
  cohort?: string;
  manifestUrl?: string;
  allowPrerelease?: boolean;
  healthcheck?: AutoUpdateHealthcheckConfig;
  rollback?: AutoUpdateRollbackConfig;
}

export interface ResolvedAutoUpdateConfig extends AutoUpdateConfig {
  enabled: boolean;
  policy: 'notify' | 'prepare';
  channel: 'stable' | 'beta';
  cohort: string;
  manifestUrl: string;
  allowPrerelease: boolean;
}

export interface AutoUpdateCheckerOptions {
  autoUpdate?: boolean | AutoUpdateConfig;
}

export interface PluginEntryInfo {
  entry: string;
  isPinned: boolean;
  pinnedVersion: string | null;
  configPath: string;
}

export interface UpdaterState {
  status: string;
  currentVersion?: string;
  preparedVersion?: string;
  previousVersion?: string;
  manifestUrl?: string;
  channel?: string;
  lastUpdatedAt?: string;
  lastError?: string;
  quarantinedVersions?: string[];
}
