import type { InterviewQuestion } from './types';

function formatQuestionContext(questions: InterviewQuestion[]): string {
  if (questions.length === 0) {
    return '当前没有解析到任何面试问题。';
  }

  return questions
    .map((question, index) => {
      const options = question.options.length
        ? `选项：${question.options.join(' | ')}`
        : '选项：自由回答';
      const suggested = question.suggested
        ? `建议：${question.suggested}`
        : '建议：无';
      return `${index + 1}. ${question.question}\n${options}\n${suggested}`;
    })
    .join('\n\n');
}

export function buildKickoffPrompt(idea: string, maxQuestions: number): string {
  return [
    '你正在为用户在其仓库内运行一场面试问答会话。',
    `初始想法：${idea}`,
    `通过每轮最多 ${maxQuestions} 个问题的简短轮次来澄清想法。`,
    '在有用的情况下，每个问题可包含 2 到 4 个选项和一个建议选项。',
    '保持务实。优先关注最模糊、风险最高的决策。',
    '在简短的友好前言之后，你必须以以下精确格式包含一个机器可读的代码块：',
    '<interview_state>',
    '{',
    '  "summary": "关于当前理解的一段简短概述",',
    '  "title": "简洁的-kebab-格式-文件名标题",',
    '  "questions": [',
    '    {',
    '      "id": "简短-kebab-格式-id-2",',
    '      "question": "问题文本",',
    '      "options": ["选项 1", "选项 2", "选项 3"],',
    '      "suggested": "最佳建议选项"',
    '    }',
    '  ]',
    '}',
    '</interview_state>',
    '规则：',
    `- 返回 0 到 ${maxQuestions} 个问题。`,
    '- 如果没有更多有用的问题，返回零个问题。',
    `- 每轮不要超过 ${maxQuestions} 个问题。`,
    '- 提供一个简洁的 "title" 字段（kebab-case 格式，3-6 个词），适合用作文件名。',
  ].join('\n');
}

export function buildResumePrompt(
  document: string,
  maxQuestions: number,
): string {
  return [
    '从这份已有的 Markdown 文档继续面试。',
    '将当前的规格说明和问答历史作为截止目前的事实依据。',
    '不要从头开始。',
    '',
    document,
    '',
    `提出下一个最有价值的澄清问题，每轮最多 ${maxQuestions} 个。`,
    '如果没有更多有用的问题，返回零个问题。',
    '返回与之前相同的 <interview_state> JSON 块格式。',
  ].join('\n');
}

export function buildAnswerPrompt(
  answers: Array<{ questionId: string; answer: string }>,
  questions: InterviewQuestion[],
  maxQuestions: number,
): string {
  const answerText = answers
    .map(
      (answer, index) =>
        `${index + 1}. ${answer.questionId}: ${answer.answer.trim()}`,
    )
    .join('\n');

  return [
    '继续同一场面试。',
    '以下是当前的活跃问题：',
    formatQuestionContext(questions),
    '用户的回答是：',
    answerText,
    '现在更新你的理解，并提出下一个最有价值的澄清问题。',
    `返回 0 到 ${maxQuestions} 个问题。如果没有更多有用的问题，返回零个问题。`,
    '返回与之前相同的 <interview_state> JSON 块格式。',
  ].join('\n\n');
}
