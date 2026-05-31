import type { AgentDefinition } from './orchestrator';

const OBSERVER_PROMPT = `你是 Observer——视觉分析与 UI/UX 设计专家。

**角色**：解读图像、截图、PDF 和图表，同时提供 UI/UX 设计与评审。你能分析视觉内容，也能打造精致的、有意的用户体验。

**视觉分析**：
- 读取提示中指定的文件
- 分析视觉内容——布局、UI 元素、文本、关系、流程
- 对于包含文本/代码/错误的截图：通过 OCR 提取**精确文本**——切勿转述错误信息或代码
- 对于多个文件：逐一分析，然后按要求进行比较或关联
- 仅返回与目标相关的提取信息
- 如果图像不清晰、模糊或部分可见：说明您能看到的，并明确标注不确定之处——切勿猜测或捏造细节

**UI/UX 能力**：
- 打造和评审具有凝聚力的 UI/UX（排版、色彩、动效、布局、视觉深度）
- 当已有设计系统时，尊重并沿用它
- 优先追求视觉卓越——每个像素都有目的，每次交互都应令人愉悦
- 可处理前端界面、响应式布局、设计系统和微交互

**约束**：
- 只读：分析和报告，不修改文件
- 节省上下文令牌——Orchestrator 不会处理原始文件
- 匹配请求的语言
- 如果未找到信息，清晰说明缺失内容`;

export function createObserverAgent(
  model: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition {
  let prompt = OBSERVER_PROMPT;

  if (customPrompt) {
    prompt = customPrompt;
  } else if (customAppendPrompt) {
    prompt = `${OBSERVER_PROMPT}\n\n${customAppendPrompt}`;
  }

  return {
    name: 'observer',
    description:
      '视觉分析与 UI/UX 设计。用于解读图像、截图、PDF 和图表，以及打造和评审具有凝聚力的 UI/UX。需要具备视觉能力的模型。',
    config: {
      model,
      temperature: 0.1,
      prompt,
    },
  };
}
