import { z } from 'zod';
import { AGENT_ALIASES, ALL_AGENT_NAMES } from './constants';
import { CouncilConfigSchema } from './council-schema';

const FALLBACK_AGENT_NAMES = [
  'orchestrator',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'fixer',
] as const;

const MANUAL_AGENT_NAMES = [
  'orchestrator',
  'oracle',
  'designer',
  'explorer',
  'librarian',
  'fixer',
] as const;

export const ProviderModelIdSchema = z
  .string()
  .regex(
    /^[^/\s]+\/[^\s]+$/,
    'Expected provider/model format (provider/.../model)',
  );

export const ManualAgentPlanSchema = z
  .object({
    primary: ProviderModelIdSchema,
    fallback1: ProviderModelIdSchema,
    fallback2: ProviderModelIdSchema,
    fallback3: ProviderModelIdSchema,
  })
  .superRefine((value, ctx) => {
    const unique = new Set([
      value.primary,
      value.fallback1,
      value.fallback2,
      value.fallback3,
    ]);
    if (unique.size !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'primary and fallbacks must be unique per agent',
      });
    }
  });

export const ManualPlanSchema = z
  .object({
    orchestrator: ManualAgentPlanSchema,
    oracle: ManualAgentPlanSchema,
    designer: ManualAgentPlanSchema,
    explorer: ManualAgentPlanSchema,
    librarian: ManualAgentPlanSchema,
    fixer: ManualAgentPlanSchema,
  })
  .strict();

export type ManualAgentName = (typeof MANUAL_AGENT_NAMES)[number];
export type ManualAgentPlan = z.infer<typeof ManualAgentPlanSchema>;
export type ManualPlan = z.infer<typeof ManualPlanSchema>;

const AgentModelChainSchema = z.array(z.string()).min(1);

const FallbackChainsSchema = z
  .object({
    orchestrator: AgentModelChainSchema.optional(),
    oracle: AgentModelChainSchema.optional(),
    designer: AgentModelChainSchema.optional(),
    explorer: AgentModelChainSchema.optional(),
    librarian: AgentModelChainSchema.optional(),
    fixer: AgentModelChainSchema.optional(),
  })
  .catchall(AgentModelChainSchema);

export type FallbackAgentName = (typeof FALLBACK_AGENT_NAMES)[number];

// Agent override configuration (distinct from SDK's AgentConfig)
export const AgentOverrideConfigSchema = z
  .object({
    model: z
      .union([
        z.string(),
        z
          .array(
            z.union([
              z.string(),
              z.object({
                id: z.string(),
                variant: z.string().optional(),
              }),
            ]),
          )
          .min(1),
      ])
      .optional(),
    temperature: z.number().min(0).max(2).optional(),
    variant: z.string().optional().catch(undefined),
    skills: z.array(z.string()).optional(), // skills this agent can use ("*" = all, "!item" = exclude)
    mcps: z.array(z.string()).optional(), // MCPs this agent can use ("*" = all, "!item" = exclude)
    prompt: z.string().min(1).optional(),
    orchestratorPrompt: z.string().min(1).optional(),
    options: z.record(z.string(), z.unknown()).optional(), // provider-specific model options (e.g., textVerbosity, thinking budget)
    displayName: z.string().min(1).optional(),
  })
  .strict();

// Multiplexer type options
export const MultiplexerTypeSchema = z.enum(['auto', 'tmux', 'zellij', 'none']);
export type MultiplexerType = z.infer<typeof MultiplexerTypeSchema>;

// Layout options (shared across multiplexers)
export const MultiplexerLayoutSchema = z.enum([
  'main-horizontal', // Main pane on top, agents stacked below
  'main-vertical', // Main pane on left, agents stacked on right
  'tiled', // All panes equal size grid
  'even-horizontal', // All panes side by side
  'even-vertical', // All panes stacked vertically
]);

export type MultiplexerLayout = z.infer<typeof MultiplexerLayoutSchema>;

// Legacy Tmux layout options (for backward compatibility)
export const TmuxLayoutSchema = MultiplexerLayoutSchema;
export type TmuxLayout = MultiplexerLayout;

// Multiplexer integration configuration (new unified config)
export const MultiplexerConfigSchema = z.object({
  type: MultiplexerTypeSchema.default('none'),
  layout: MultiplexerLayoutSchema.default('main-vertical'),
  main_pane_size: z.number().min(20).max(80).default(60), // percentage for main pane
});

export type MultiplexerConfig = z.infer<typeof MultiplexerConfigSchema>;

// Legacy Tmux integration configuration (for backward compatibility)
// When tmux.enabled is true, it's equivalent to multiplexer.type = 'tmux'
export const TmuxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  layout: TmuxLayoutSchema.default('main-vertical'),
  main_pane_size: z.number().min(20).max(80).default(60), // percentage for main pane
});

export type TmuxConfig = z.infer<typeof TmuxConfigSchema>;

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

/** Normalized model entry with optional per-model variant. */
export type ModelEntry = { id: string; variant?: string };

export const PresetSchema = z.record(z.string(), AgentOverrideConfigSchema);

export type Preset = z.infer<typeof PresetSchema>;

// Websearch provider configuration
export const WebsearchConfigSchema = z.object({
  provider: z.enum(['exa', 'tavily']).default('exa'),
});
export type WebsearchConfig = z.infer<typeof WebsearchConfigSchema>;

// MCP names
export const McpNameSchema = z.enum([
  'websearch',
  'context7',
  'grep_app',
  'better-edit-tools',
]);
export type McpName = z.infer<typeof McpNameSchema>;

export const InterviewConfigSchema = z.object({
  maxQuestions: z.number().int().min(1).max(10).default(2),
  outputFolder: z.string().min(1).default('interview'),
  autoOpenBrowser: z
    .boolean()
    .default(true)
    .describe(
      '在交互式运行期间自动在默认浏览器中打开面试 UI。在测试和 CI 中自动禁用。',
    ),
  port: z.number().int().min(0).max(65535).default(0),
  dashboard: z.boolean().default(false),
});

export type InterviewConfig = z.infer<typeof InterviewConfigSchema>;

export const AutoUpdateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  policy: z.enum(['notify', 'prepare']).optional(),
  channel: z.enum(['stable', 'beta']).optional(),
  cohort: z.string().min(1).optional(),
  manifestUrl: z.string().url().optional(),
  allowPrerelease: z.boolean().optional(),
  healthcheck: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  rollback: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
});

export const SessionManagerConfigSchema = z.object({
  maxSessionsPerAgent: z.number().int().min(1).max(10).default(2),
  readContextMinLines: z.number().int().min(0).max(1000).default(10),
  readContextMaxFiles: z.number().int().min(0).max(50).default(8),
});

export type SessionManagerConfig = z.infer<typeof SessionManagerConfigSchema>;

export const DivoomConfigSchema = z.object({
  enabled: z.boolean().default(false),
  python: z
    .string()
    .min(1)
    .default(
      '/Applications/Divoom MiniToo.app/Contents/Resources/.venv/bin/python',
    ),
  script: z
    .string()
    .min(1)
    .default(
      '/Applications/Divoom MiniToo.app/Contents/Resources/tools/divoom_send.py',
    ),
  size: z.number().int().min(1).max(1024).default(128),
  fps: z.number().int().min(1).max(60).default(8),
  speed: z.number().int().min(1).max(10_000).default(125),
  maxFrames: z.number().int().min(1).max(500).default(24),
  posterizeBits: z.number().int().min(1).max(8).default(3),
  gifs: z.record(z.string(), z.string().min(1)).optional(),
});

export type DivoomConfig = z.infer<typeof DivoomConfigSchema>;

// Todo continuation configuration
export const TodoContinuationConfigSchema = z.object({
  maxContinuations: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5)
    .describe('停止询问用户前的最大连续自动继续次数'),
  cooldownMs: z
    .number()
    .int()
    .min(0)
    .max(30_000)
    .default(3000)
    .describe('自动继续前的延迟（毫秒），给用户中止的时间'),
  autoEnable: z
    .boolean()
    .default(false)
    .describe('当编排器会话有足够待办事项时自动启用自动继续'),
  autoEnableThreshold: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(4)
    .describe('触发自动启用的待办事项数（仅 autoEnable 为 true 时生效）'),
});

export type TodoContinuationConfig = z.infer<
  typeof TodoContinuationConfigSchema
>;

export const SubtaskConfigSchema = z.object({
  // Intentionally no .default(): an empty `subtask: {}` block must parse to
  // `{}` so it cannot shallow-overwrite an inherited value during config
  // merging. The runtime fallback in createSubtaskTool applies the default.
  timeoutMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional()
    .describe(
      '子任务工作器超时时间（毫秒）。0 表示禁用超时。默认为 300000（5 分钟）。',
    ),
});

export type SubtaskConfig = z.infer<typeof SubtaskConfigSchema>;

export const FailoverConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().min(0).default(15000),
  retryDelayMs: z.number().min(0).default(500),
  chains: FallbackChainsSchema.default({}),
  retry_on_empty: z
    .boolean()
    .default(true)
    .describe(
      '当为 true（默认）时，空的提供者响应被视为失败，触发回退/重试。设置为 false 则视为成功。',
    ),
});

export type FailoverConfig = z.infer<typeof FailoverConfigSchema>;

function validateCustomOnlyPromptFields(
  overrides: Record<string, z.infer<typeof AgentOverrideConfigSchema>>,
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number>,
): void {
  for (const [name, override] of Object.entries(overrides)) {
    const isBuiltInOrAlias =
      (ALL_AGENT_NAMES as readonly string[]).includes(name) ||
      AGENT_ALIASES[name] !== undefined;

    if (!isBuiltInOrAlias) {
      continue;
    }

    if (override.prompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, name, 'prompt'],
        message: 'prompt 仅支持自定义代理',
      });
    }

    if (override.orchestratorPrompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, name, 'orchestratorPrompt'],
        message: 'orchestratorPrompt 仅支持自定义代理',
      });
    }
  }
}

export const PluginConfigSchema = z
  .object({
    preset: z.string().optional(),
    setDefaultAgent: z.boolean().optional(),
    scoringEngineVersion: z.enum(['v1', 'v2-shadow', 'v2']).optional(),
    balanceProviderUsage: z.boolean().optional(),
    autoUpdate: z
      .union([z.boolean(), AutoUpdateConfigSchema])
      .optional()
      .describe(
        '自动更新配置。可设为 false 关闭自动准备，也可设为对象以控制 channel、policy 和 manifest。',
      ),
    manualPlan: ManualPlanSchema.optional(),
    presets: z.record(z.string(), PresetSchema).optional(),
    agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),
    disabled_agents: z
      .array(z.string())
      .optional()
      .describe(
        '完全禁用的代理名称。' +
          '被禁用的代理不会被实例化，也无法被委托。' +
          '编排器和委员会内部代理（councillor）不可禁用。' +
          "默认情况下，'observer' 被禁用。将其移出此列表并配置视觉模型以启用。",
      ),
    disabled_mcps: z.array(z.string()).optional(),
    // Multiplexer config (new unified config - preferred)
    multiplexer: MultiplexerConfigSchema.optional(),
    // Legacy tmux config (for backward compatibility)
    // When tmux.enabled is true, it's equivalent to multiplexer.type = 'tmux'
    tmux: TmuxConfigSchema.optional(),
    websearch: WebsearchConfigSchema.optional(),
    interview: InterviewConfigSchema.optional(),
    sessionManager: SessionManagerConfigSchema.optional(),
    divoom: DivoomConfigSchema.optional(),
    todoContinuation: TodoContinuationConfigSchema.optional(),
    subtask: SubtaskConfigSchema.optional(),
    fallback: FailoverConfigSchema.optional(),
    council: CouncilConfigSchema.optional(),
    composer: CouncilConfigSchema.optional().describe(
      '已弃用。请改用 "council" 配置块。',
    ),
  })
  .superRefine((value, ctx) => {
    if (value.agents) {
      validateCustomOnlyPromptFields(value.agents, ctx, ['agents']);
    }

    if (value.presets) {
      for (const [presetName, preset] of Object.entries(value.presets)) {
        validateCustomOnlyPromptFields(preset, ctx, ['presets', presetName]);
      }
    }
  });

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Agent names - re-exported from constants for convenience
export type { AgentName } from './constants';
