import { z } from 'zod';

/**
 * Validates model IDs in "provider/model" format.
 * Inlined here to avoid circular dependency with schema.ts.
 */
const ModelIdSchema = z
  .string()
  .regex(
    /^[^/\s]+\/[^\s]+$/,
    'Expected provider/model format (e.g. "openai/gpt-5.4-mini")',
  );

/**
 * Configuration for a single councillor within a preset.
 * Each councillor is an independent LLM that processes the same prompt.
 *
 * Councillors run as agent sessions with read-only codebase access
 * (read, glob, grep, lsp, list). They can examine the codebase but
 * cannot modify files or spawn subagents.
 */
export const CouncillorConfigSchema = z.object({
  model: ModelIdSchema.describe(
    '提供者/模型格式的模型 ID（例如 "openai/gpt-5.4-mini"）',
  ),
  variant: z.string().optional(),
  prompt: z
    .string()
    .optional()
    .describe('注入到 councillor 用户提示中的可选角色/指导说明'),
});

export type CouncillorConfig = z.infer<typeof CouncillorConfigSchema>;

/**
 * A named preset grouping several councillors.
 *
 * All keys are treated as councillor names mapping to councillor configs.
 * The reserved key `"master"` is silently ignored (legacy from when
 * council-master was a separate agent).
 */
export const CouncilPresetSchema = z
  .record(z.string(), z.record(z.string(), z.unknown()))
  .transform((entries, ctx) => {
    const councillors: Record<string, CouncillorConfig> = {};

    for (const [key, raw] of Object.entries(entries)) {
      // Silently skip the legacy "master" key — no longer parsed as a
      // councillor. Old configs with per-preset master overrides won't
      // error, but the override has no effect.
      if (key === 'master') continue;

      // Legacy nested format: old configs wrapped councillors in a
      // "councillors" key inside each preset. Unwrap them into the
      // parent so the config still works without migration.
      if (key === 'councillors' && typeof raw === 'object' && raw !== null) {
        for (const [innerKey, innerRaw] of Object.entries(
          raw as Record<string, unknown>,
        )) {
          const innerParsed = CouncillorConfigSchema.safeParse(innerRaw);
          if (!innerParsed.success) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `无效的 councillor "${innerKey}"（嵌套在旧的 "councillors" 键下）：${innerParsed.error.issues
                .map((i) => i.message)
                .join(', ')}`,
            });
            return z.NEVER;
          }
          councillors[innerKey] = innerParsed.data;
        }
        continue;
      }

      const parsed = CouncillorConfigSchema.safeParse(raw);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `无效的 councillor "${key}"：${parsed.error.issues
            .map((i) => i.message)
            .join(', ')}`,
        });
        return z.NEVER;
      }
      councillors[key] = parsed.data;
    }

    return councillors;
  });

export type CouncilPreset = z.infer<typeof CouncilPresetSchema>;

/**
 * Execution mode for councillors.
 * - parallel: Run all councillors concurrently (default, fastest for multi-model systems)
 * - serial: Run councillors one at a time (required for single-model systems to avoid conflicts)
 */
export const CouncillorExecutionModeSchema = z
  .enum(['parallel', 'serial'])
  .default('parallel')
  .describe(
    'councillor 的执行模式。单模型系统请使用 "serial" 以避免冲突。' +
      '多模型系统请使用 "parallel" 以获得更快的执行速度。',
  );

/**
 * Top-level council configuration.
 *
 * Example JSONC:
 * ```jsonc
 * {
 *   "council": {
 *     "presets": {
 *       "default": {
 *         "alpha": { "model": "openai/gpt-5.4-mini" },
 *         "beta":  { "model": "openai/gpt-5.3-codex" },
 *         "gamma": { "model": "google/gemini-3-pro" }
 *       }
 *     },
 *     "timeout": 180000,
 *     "councillor_execution_mode": "serial"
 *   }
 * }
 * ```
 */
export const CouncilConfigSchema = z
  .object({
    presets: z.record(z.string(), CouncilPresetSchema),
    timeout: z.number().min(0).default(180000),
    default_preset: z.string().default('default'),
    councillor_execution_mode: CouncillorExecutionModeSchema.describe(
      'councillor 的执行模式。"serial" 逐个运行（单模型系统必需）。"parallel" 并发运行（默认，多模型系统更快）。',
    ),
    councillor_retries: z
      .number()
      .int()
      .min(0)
      .max(5)
      .default(3)
      .describe(
        'councillor 返回空响应时的重试次数（例如因提供者速率限制）。默认值：3 次重试。',
      ),
    // Deprecated fields — accepted for backward compatibility but ignored.
    // The council agent now synthesizes directly; no separate master session.
    // Uses permissive schemas since the values are discarded — strict
    // validation would break old configs with non-standard model IDs.
    master: z
      .unknown()
      .optional()
      .describe('已弃用 — 忽略。Council agent 直接进行综合。'),
    master_timeout: z
      .unknown()
      .optional()
      .describe('已弃用 — 忽略。请使用 "timeout" 代替。'),
    master_fallback: z
      .unknown()
      .optional()
      .describe('已弃用 — 忽略。不再有独立的 master 会话。'),
  })
  .transform((data) => {
    // Detect deprecated fields and attach warning for consumers
    const deprecated: string[] = [];
    if (data.master !== undefined) deprecated.push('master');
    if (data.master_timeout !== undefined) deprecated.push('master_timeout');
    if (data.master_fallback !== undefined) deprecated.push('master_fallback');

    // Backward compat: extract master.model so the council agent can use it
    // as a fallback when no explicit council entry exists in the active preset.
    // See https://github.com/conglinyizhi/sylastra-agent-tree/issues/369
    const legacyMasterModel: string | undefined =
      typeof data.master === 'object' &&
      data.master !== null &&
      'model' in data.master &&
      typeof (data.master as { model: unknown }).model === 'string'
        ? (data.master as { model: string }).model
        : undefined;

    return {
      presets: data.presets,
      timeout: data.timeout,
      default_preset: data.default_preset,
      councillor_execution_mode: data.councillor_execution_mode,
      councillor_retries: data.councillor_retries,
      _deprecated: deprecated.length > 0 ? deprecated : undefined,
      _legacyMasterModel: legacyMasterModel,
    };
  });

export type CouncilConfig = z.infer<typeof CouncilConfigSchema>;
export type CouncillorExecutionMode = z.infer<
  typeof CouncillorExecutionModeSchema
>;

/**
 * A sensible default council configuration that users can copy into their
 * opencode.jsonc. Provides a 3-councillor preset using common models.
 *
 * Users should replace models with ones they have access to.
 *
 * ```jsonc
 * "council": DEFAULT_COUNCIL_CONFIG
 * ```
 */
export const DEFAULT_COUNCIL_CONFIG: z.input<typeof CouncilConfigSchema> = {
  presets: {
    default: {
      alpha: { model: 'openai/gpt-5.4-mini' },
      beta: { model: 'openai/gpt-5.3-codex' },
      gamma: { model: 'google/gemini-3-pro' },
    },
  },
};

/**
 * Result of a council session.
 */
export interface CouncilResult {
  success: boolean;
  result?: string;
  error?: string;
  councillorResults: Array<{
    name: string;
    model: string;
    status: 'completed' | 'failed' | 'timed_out';
    result?: string;
    error?: string;
  }>;
}
