# src/hooks/filter-available-skills/

## 职责

- 过滤系统提示中的 `<available_skills>` XML 块，仅为当前代理展示相关技能。
- 从配置管理每个代理的技能可见性：某些技能对特定代理可见，其他隐藏。
- 在发送给模型前转换消息，使得只有授权的技能存在于系统提示中。

## 设计

- 代理→技能映射在配置中定义（通过 `getSkillPermissionsForAgent` 等加载）。
- 需要渲染的技能通过 `getResolvedSkills` 获取，结合已注册技能和权限。
- `<available_skills>` 和嵌套的 `<skill>...</skill>` 块通过正则表达式提取匹配。

## 流程

1. 在转换输出中，通过 `getCurrentAgent` 确定 `agentName`。
2. 加载 `permissionRules = getSkillPermissionsForAgent(agentName, configuredSkills)`。
3. 对每个包含 `<available_skills>` 的 `text` 部分，重构为仅包含允许的 `<skill>` 条目，若无匹配则渲染 `<available_skills>\n没有可用技能。\n</available_skills>`。
4. 将转换后的 `part.text` 原地写回 `output.messages`。

## 集成

- 钩子在 `src/hooks/index.ts` 中连接，并由插件钩子注册机制消费。
- 在模型调用前的消息路径中执行，因此用户不会在 UI 中看到变更后的提示文本，但模型接收受限的能力集。
- 依赖于 `cli/skills` 和 `config` 模块，以及仅用于注册兼容性的 `PluginInput`。
