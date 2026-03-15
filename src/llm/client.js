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
    const message = data.choices?.[0]?.message || {};
    // GLM-4.7 思考模式：内容可能在 content 或 reasoning_content 中
    const content = message.content || message.reasoning_content || '';

    logger.debug('LLM response', { contentLength: content.length });

    return content;
  }

  /**
   * Split exam content into questions and materials
   */
  async splitContent(rawContent) {
    // 限制内容长度
    const maxLength = 10000;
    const truncatedContent = rawContent.length > maxLength
      ? rawContent.substring(0, maxLength) + '\n[内容已截断]'
      : rawContent;

    const prompt = `分析以下申论试卷，提取所有题目和材料。

试卷内容：
${truncatedContent}

请严格按照以下JSON格式输出，不要输出任何其他内容：

\`\`\`json
{
  "questions": [
    {"number": 1, "text": "题目完整内容", "requirements": "作答要求", "score": 20}
  ],
  "materials": [
    {"number": 1, "content": "材料完整内容"}
  ]
}
\`\`\`

注意：
1. 只输出JSON代码块，不要有任何解释
2. 保持内容完整，不要用省略号
3. 使用英文引号和标点`;

    const response = await this.chat([
      { role: 'system', content: '你是一个JSON数据提取工具，只输出JSON代码块。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, maxTokens: 8192 });

    logger.debug('LLM split response', { responseLength: response.length, preview: response.substring(0, 200) });

    // 尝试从代码块中提取 JSON
    let jsonStr = null;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // 回退：直接匹配 JSON 对象
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    if (!jsonStr) {
      logger.error('No JSON found in response', { response: response.substring(0, 1000) });
      throw new Error('Failed to parse LLM response as JSON: no JSON object found');
    }

    // 清理 JSON 字符串
    jsonStr = jsonStr.replace(/\.\.\./g, '等');

    try {
      const result = JSON.parse(jsonStr);
      logger.info('Content split successful', {
        questionCount: result.questions?.length || 0,
        materialCount: result.materials?.length || 0
      });
      return result;
    } catch (parseError) {
      logger.error('JSON parse failed, trying fix', { error: parseError.message });

      // 尝试修复 JSON
      const fixedJson = this.tryFixJson(jsonStr);
      try {
        const result = JSON.parse(fixedJson);
        logger.info('Content split successful (after fix)', {
          questionCount: result.questions?.length || 0,
          materialCount: result.materials?.length || 0
        });
        return result;
      } catch (e) {
        logger.error('JSON fix failed', { error: e.message });
        throw new Error(`Failed to parse LLM response as JSON: ${parseError.message}`);
      }
    }
  }

  /**
   * 尝试修复 JSON 字符串中的常见错误
   */
  tryFixJson(jsonStr) {
    let result = '';
    let inString = false;
    let escape = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escape) {
        result += char;
        escape = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        escape = true;
        continue;
      }

      // 处理中文引号（在字符串内，替换为转义的英文引号）
      if (char === '"' || char === '"') {
        if (inString) {
          result += '\\"';
        } else {
          result += char;
        }
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      if (inString) {
        // 在字符串内，转义特殊字符
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          // 跳过回车
        } else if (char === '\t') {
          result += '\\t';
        } else if (char.charCodeAt(0) < 32) {
          // 其他控制字符，跳过
        } else {
          result += char;
        }
      } else {
        result += char;
      }
    }

    return result;
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
