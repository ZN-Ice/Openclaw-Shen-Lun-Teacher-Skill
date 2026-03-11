import { logger } from '../utils/logger.js';
import { getLLMClient } from '../llm/client.js';
import { findMaterialsForQuestion } from '../db/index.js';

/**
 * Tutor module for guiding learning
 */
export class Tutor {
  constructor() {
    this.llm = getLLMClient();
  }

  /**
   * Start guidance for a question
   */
  async startGuidance(question) {
    logger.info('Starting guidance', { questionId: question.id });

    const materials = findMaterialsForQuestion(question.id);

    const guidance = await this.llm.guideThinking(question, materials);

    return {
      phase: 'thinking',
      question,
      materials,
      guidance,
    };
  }

  /**
   * Analyze user's thinking
   */
  async analyzeThinking(question, userThought) {
    logger.info('Analyzing thinking', { questionId: question.id });

    const materials = findMaterialsForQuestion(question.id);

    const analysis = await this.llm.guideThinking(question, materials, userThought);

    return {
      phase: 'analysis',
      analysis,
    };
  }

  /**
   * Provide hints without giving away the answer
   */
  async provideHint(question, currentProgress) {
    const materials = findMaterialsForQuestion(question.id);

    const prompt = `学生正在解答以下申论题目，已经完成了部分思考。请提供一个提示，帮助他继续前进，但不要直接给出答案。

【题目】
${question.question_text}

【材料】
${materials.map((m) => `材料${m.material_number}: ${m.content.substring(0, 200)}...`).join('\n')}

【学生目前的进展】
${currentProgress}

请提供一个引导性的提示（2-3句话）：`;

    const hint = await this.llm.chat([
      {
        role: 'system',
        content: '你是一个善于引导的申论老师，给学生恰到好处的提示。',
      },
      { role: 'user', content: prompt },
    ]);

    return { hint };
  }

  /**
   * Expand on a topic from multiple angles
   */
  async expandTopic(question, topic) {
    const prompt = `关于申论题目的某个方面，请从多个角度进行拓展分析。

【题目】
${question.question_text}

【关注点】
${topic}

请从以下角度进行拓展：
1. 政策角度：相关的政策法规
2. 社会角度：社会影响和公众反应
3. 经济角度：经济成本和效益
4. 实践角度：具体可行的措施

每个角度请用2-3句话简要说明。`;

    const expansion = await this.llm.chat([
      {
        role: 'system',
        content: '你是一个知识渊博的申论老师，擅长多角度分析问题。',
      },
      { role: 'user', content: prompt },
    ]);

    return { expansion };
  }
}

// Singleton
let tutorInstance = null;

export function getTutor() {
  if (!tutorInstance) {
    tutorInstance = new Tutor();
  }
  return tutorInstance;
}
