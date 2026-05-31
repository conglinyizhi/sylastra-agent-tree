# src/hooks/phase-reminder/

## 职责

在下一次 LLM 请求前，将阶段提醒（phase reminder）前置到最新用户消息文本中，以保持编排器（orchestrator）指引在长轮次中的一致性。

## 设计

- `PHASE_REMINDER` 常量由 `PHASE_REMINDER_TEXT` 组成（位于 `config/constants.ts`）。
- `createPhaseReminderHook()` 返回一个 `experimental.chat.messages.transform` 处理器。
- 消息过滤具有角色/代理感知：
  - 定位 `output.messages` 中最新的一条 `'user'` 角色消息，
  - 仅当没有显式代理或 `agent === 'orchestrator'` 时进行修改，
  - 对包含 `SLIM_INTERNAL_INITIATOR_MARKER` 的内部控制消息无操作。
- 修改目标是该消息中的第一个 `text` 部分；替换方式是原地添加前缀。
- 使用来自 `../../utils` 的 `SLIM_INTERNAL_INITIATOR_MARKER` 以避免反馈循环。

## 流程

1. 在 transform 时，反向扫描 `messages` 找到最后一个 `info.role === 'user'`。
2. 如果代理非 orchestrator，则返回。
3. 定位第一个 `type === 'text'` 的部分。
4. 如果已存在标记，则返回。
5. 将 `PHASE_REMINDER + '\n\n---\n\n'` 前置到 `part.text`。

## 集成

- 通过 `src/hooks/index.ts` 注册，并在 `src/index.ts` 中进行插件级钩子接线。
- 消费 `experimental.chat.messages.transform`，仅修改传出的 `messages` 载荷。
- 不依赖有状态的服务；不需要网络或客户端 API。
