# src/hooks/post-file-tool-nudge/

## 职责

检测最近的文件交互操作（`Read`/`Write`），并排队一个一次性工作流提醒，该提醒将在下次系统提示 transform 时注入，而不修改工具执行输出。

## 设计

- 工厂函数 `createPostFileToolNudgeHook(options?)` 生成三个处理器：
  - `tool.execute.after`
  - `experimental.chat.system.transform`
  - `event`
- 每个实例拥有内存中的 `pendingSessionIds: Set<string>`，用于跟踪最近执行了文件工具的会话。
- `FILE_TOOLS` 是标准集合 `{ 'Read', 'read', 'Write', 'write' }`。
- 可通过 `options.shouldInject?: (sessionID) => boolean` 按会话选择性注入。
- 清理路径处理 `session.deleted` 载荷的两种格式（`properties.sessionID` 和 `properties.info.id`）。

## 流程
1. `tool.execute.after`：如果工具是文件工具且包含 `sessionID`，将其加入 `pendingSessionIds`。
2. `experimental.chat.system.transform`：如果会话有待处理标记，则移除该标记并向 `output.system` 追加 `POST_FILE_TOOL_NUDGE`（`PHASE_REMINDER_TEXT`）。
3. 可选的 `shouldInject` 门控可以消费但不注入。
4. 在同一 transform 之前的后续 `Read`/`Write` 事件，基于集合语义会合并为一条提醒。
5. `session.deleted` 事件从集合中移除过期的会话 ID。

## 集成

- 通过 `src/hooks/index.ts` 注册，在插件生命周期注册时激活。
- 仅修改 `output.system`，确保已持久化的文件工具输出保持不变。
- 由需要反模式缓解（`inspect/edit` 循环）的 orchestrator 会话流消费。
