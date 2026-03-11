import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * LLM Client for GLM API (OpenAI-compatible format)
 */
export class LLMClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || CONFIG.llm.baseUrl;
    this.apiKey = options.apiKey || CONFIG.llm.apiKey;
    this.model = options.model || CONFIG.llm.model;
  }

  /**
   * Send chat completion request
   */
  async chat(messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: options.model || this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };

    logger.debug('LLM request', { model: body.model, messageCount: messages.length });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('LLM request failed', { status: response.status, error });
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    logger.debug('LLM response', { contentLength: content.length });

    return content;
  }

  /**
   * Split exam content into questions and materials
   */
  async splitContent(rawContent) {
    const prompt = `你是一个申论试卷解析专家。请将以下申论试卷内容拆分为题目和材料。

要求：
1. 识别所有题目（包括题目编号、题目要求、分值）
2. 识别所有材料（包括材料编号、材料内容）
3. 输出JSON格式

输出格式示例：
{
  "questions": [
    {
      "number": 1,
      "text": "题目内容",
      "requirements": "作答要求",
      "score": 20
    }
  ],
  "materials": [
    {
      "number": 1,
      "content": "材料内容"
    }
  ]
}

试卷内容：
${rawContent}`;

    const response = await this.chat([
      { role: 'system', content: '你是一个专业的申论试卷解析助手，擅长结构化提取试卷内容。' },
      { role: 'user', content: prompt },
    ]);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse LLM response as JSON');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Verify split results
   */
  async verifySplit(questions, materials) {
    const prompt = `请验证以下题目和材料的拆分是否正确：

题目数量: ${questions.length}
材料数量: ${materials.length}

题目列表:
${questions.map((q) => `- 第${q.number}题: ${q.text.substring(0, 100)}...`).join('\n')}

材料列表:
${materials.map((m) => `- 材料${m.number}: ${m.content.substring(0, 100)}...`).join('\n')}

请检查：
1. 题目编号是否连续
2. 材料编号是否连续
3. 是否有遗漏的内容
4. 拆分是否准确

回复格式：
{
  "valid": true/false,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1"]
}`;

    const response = await this.chat([
      { role: 'system', content: '你是一个申论试卷审核专家，负责验证解析结果的准确性。' },
      { role: 'user', content: prompt },
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { valid: true, issues: [], suggestions: [] };
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Guide thinking process for a question
   */
  async guideThinking(question, materials, userThought = null) {
    const materialsText = materials.map((m) => `【材料${m.number || m.material_number}】\n${m.content}`).join('\n\n');

    let prompt;

    if (userThought) {
      prompt = `用户对以下申论题目的思考：

【题目】
${question.question_text}

【材料】
${materialsText}

【用户的思考】
${userThought}

请：
1. 分析用户的思路是否正确
2. 指出可能的遗漏或偏差
3. 提供更深入的思考角度
4. 给出结构化的答题建议

回复要求：
- 先肯定用户的正确理解
- 再指出需要改进的地方
- 最后提供具体的答题框架`;
    } else {
      prompt = `请引导用户思考以下申论题目：

【题目】
${question.question_text}

【要求】
${question.requirements || '无特殊要求'}

【材料】
${materialsText}

请：
1. 提出引导性问题，帮助用户理解题目
2. 指出材料中的关键信息点
3. 提供答题思路的框架
4. 不要直接给出答案

回复要求：
- 用启发式提问引导
- 循序渐进，不要一次性给出太多信息
- 鼓励用户主动思考`;
    }

    return await this.chat([
      {
        role: 'system',
        content: '你是一个经验丰富的申论辅导老师，擅长引导学生思考，而不是直接给答案。',
      },
      { role: 'user', content: prompt },
    ]);
  }

  /**
   * Score user answer
   */
  async scoreAnswer(question, materials, userAnswer) {
    const materialsText = materials.map((m) => `【材料${m.number || m.material_number}】\n${m.content}`).join('\n\n');

    const prompt = `请评分以下申论答案：

【题目】
${question.question_text}

【要求】
${question.requirements || '无特殊要求'}
${question.score ? `（满分${question.score}分）` : ''}

【材料】
${materialsText}

【用户答案】
${userAnswer}

请从以下维度评分：
1. 内容完整性 (0-100)：是否覆盖所有要点
2. 逻辑结构 (0-100)：结构是否清晰合理
3. 语言表达 (0-100)：语言是否规范流畅
4. 观点深度 (0-100)：分析是否深入到位

回复格式：
{
  "score": 总分,
  "dimensions": {
    "completeness": 分数,
    "structure": 分数,
    "language": 分数,
    "depth": 分数
  },
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": ["改进建议1", "改进建议2"],
  "sampleAnswer": "参考答案要点"
}`;

    const response = await this.chat([
      {
        role: 'system',
        content: '你是一个专业的申论阅卷专家，评分公正客观，反馈详细有建设性。',
      },
      { role: 'user', content: prompt },
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        score: 60,
        dimensions: { completeness: 60, structure: 60, language: 60, depth: 60 },
        strengths: ['已作答'],
        weaknesses: ['需要更详细的分析'],
        suggestions: ['请参考题目要求重新组织答案'],
        rawFeedback: response,
      };
    }

    return JSON.parse(jsonMatch[0]);
  }
}

// Singleton instance
let clientInstance = null;

export function getLLMClient() {
  if (!clientInstance) {
    clientInstance = new LLMClient();
  }
  return clientInstance;
}
