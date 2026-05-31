# apply-patch

## 职责

为 `tool.execute.before` 上的 `apply_patch` 提供弹性预处理器，重写可恢复的陈旧块，验证工作区边界，并在有问题的补丁到达 OpenCode 的原生补丁执行器之前阻止它们。

## 设计

- 入口点是 `index.ts` 中的 `createApplyPatchHook`，绑定到 `tool.execute.before`。
- `rewritePatch`（`operations.ts`）是钩子使用的主流水线，由以下模块支持：
  - `parseValidatedPatch` / `createPatchExecutionContext`（`execution-context.ts`）用于补丁解析和路径/状态验证。
  - `parsePatch` / `parsePatchStrict` / `formatPatch`（`codec.ts`）用于补丁 AST 转换和序列化。
  - `resolveChunkStart`、`locateChunk`、`resolveUpdateChunks`、`applyHits`（`resolution.ts`）用于上下文匹配。
  - `resolveBy...` 在 `matching.ts` 中的辅助函数（`seek`、`seekMatch`、`list`、`rescueByPrefixSuffix`、`rescueByLcs`）用于容错匹配。
- `types.ts` 定义跨模块使用的领域契约（`PatchChunk`、`PatchHunk`、`ResolvedChunk`、`ApplyPatchErrorKind` 等）。
- 错误语义集中在 `errors.ts` 中（`ApplyPatchError`、`createApplyPatchBlockedError`、`createApplyPatchVerificationError`、`isApplyPatchError`），并在钩子日志记录和抛出的错误中呈现。
- 没有暴露额外的运行时配置；行为由常量 `APPLY_PATCH_RESCUE_OPTIONS`（`prefixSuffix` + `lcsRescue`）控制。

## 流程

1. `createApplyPatchHook` 仅过滤 `input.tool === 'apply_patch'`。
2. 要求 `output.args.patchText` 是字符串。
3. 从 `input.directory` / `ctx.directory` / `ctx.worktree` 解析 `root` 和 `worktree`。
4. 调用 `rewritePatch(root, patchText, options, worktree)`。
5. 当 `result.changed` 为真时，用规范化后的补丁文本替换 `output.args.patchText`。
6. 失败时，标准化为 `ApplyPatchError`，记录 `blocked | validation | verification | internal`，并重新抛出以阻止原生执行。

## 集成

- 由 `src/index.ts` 通过 `createApplyPatchHook` 消费。
- 通过 OpenCode 钩子点 `tool.execute.before` 在原生工具执行前生效。
- 下游依赖包括 `ctx.client`（仅间接用于上下文）和 `utils/logger` 用于结构化的钩子遥测。
- 使用 `Patch` 解析器/解析器模块来保持 `new_lines` 字节不变，同时仅修改陈旧的锚点和块上下文。
