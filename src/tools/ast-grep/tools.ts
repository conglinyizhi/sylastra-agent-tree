import { type ToolDefinition, tool } from '@opencode-ai/plugin';
import { runSg } from './cli';
import type { CliLanguage } from './types';
import { CLI_LANGUAGES } from './types';
import {
  formatReplaceResult,
  formatSearchResult,
  getEmptyResultHint,
} from './utils';

function showOutputToUser(context: unknown, output: string): void {
  const ctx = context as {
    metadata?: (input: { metadata: { output: string } }) => void;
  };
  ctx.metadata?.({ metadata: { output } });
}

export const ast_grep_search: ToolDefinition = tool({
  description:
    '使用 AST 感知的匹配方式在文件系统中搜索代码模式。支持 25 种编程语言。' +
    '使用元变量：$VAR（单个节点）、$$$（多个节点）。' +
    '重要提示：模式必须是完整的 AST 节点（有效代码）。' +
    "对于函数，需要包含参数和函数体：'export async function $NAME($$$) { $$$ }'，而不是 'export async function $NAME'。" +
    "示例：'console.log($MSG)'、'def $FUNC($$$):'、'async function $NAME($$$)'",
  args: {
    pattern: tool.schema
      .string()
      .describe('包含元变量（$VAR、$$$）的 AST 模式。必须是完整的 AST 节点。'),
    lang: tool.schema.enum(CLI_LANGUAGES).describe('目标语言'),
    paths: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("要搜索的路径（默认：['.']）"),
    globs: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('包含/排除的 glob 模式（以 ! 前缀排除）'),
    context: tool.schema.number().optional().describe('匹配行周围的上下文行数'),
  },
  execute: async (args, context) => {
    try {
      const result = await runSg({
        pattern: args.pattern,
        lang: args.lang as CliLanguage,
        paths: args.paths,
        globs: args.globs,
        context: args.context,
      });

      let output = formatSearchResult(result);

      if (result.matches.length === 0 && !result.error) {
        const hint = getEmptyResultHint(args.pattern, args.lang as CliLanguage);
        if (hint) {
          output += `\n\n${hint}`;
        }
      }

      showOutputToUser(context, output);
      return output;
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`;
      showOutputToUser(context, output);
      return output;
    }
  },
});

export const ast_grep_replace: ToolDefinition = tool({
  description:
    '使用 AST 感知的重写方式替换文件系统中的代码模式。' +
    '默认进行 Dry-run（预览）。在重写中使用元变量以保留匹配内容。' +
    "示例：pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
  args: {
    pattern: tool.schema.string().describe('要匹配的 AST 模式'),
    rewrite: tool.schema.string().describe('替换模式（可使用模式中的 $VAR）'),
    lang: tool.schema.enum(CLI_LANGUAGES).describe('目标语言'),
    paths: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('要搜索的路径'),
    globs: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('包含/排除的 glob 模式'),
    dryRun: tool.schema
      .boolean()
      .optional()
      .describe('预览更改但不实际应用（默认：true）'),
  },
  execute: async (args, context) => {
    try {
      const result = await runSg({
        pattern: args.pattern,
        rewrite: args.rewrite,
        lang: args.lang as CliLanguage,
        paths: args.paths,
        globs: args.globs,
        updateAll: args.dryRun === false,
      });
      const output = formatReplaceResult(result, args.dryRun !== false);
      showOutputToUser(context, output);
      return output;
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`;
      showOutputToUser(context, output);
      return output;
    }
  },
});
