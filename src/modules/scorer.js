import { logger } from '../utils/logger.js';
import { getLLMClient } from '../llm/client.js';
import { findMaterialsForQuestion, createAnswerRecord } from '../db/index.js';

/**
 * Scorer module for evaluating answers
 */
export class Scorer {
  constructor() {
    this.llm = getLLMClient();
  }

  /**
   * Score a user's answer
   */
  async scoreAnswer(sessionId, question, userAnswer) {
    logger.info('Scoring answer', { sessionId, questionId: question.id });

    const materials = findMaterialsForQuestion(question.id);

    const result = await this.llm.scoreAnswer(question, materials, userAnswer);

    // Save answer record
    const recordId = createAnswerRecord({
      sessionId,
      questionId: question.id,
      userAnswer,
      score: result.score,
      feedback: JSON.stringify(result),
    });

    logger.info('Answer scored', { recordId, score: result.score });

    return {
      recordId,
      ...result,
    };
  }

  /**
   * Get detailed feedback
   */
  formatFeedback(result) {
    const lines = [];

    lines.push(`📊 总分: ${result.score}/100`);
    lines.push('');

    if (result.dimensions) {
      lines.push('📈 各维度得分:');
      lines.push(`  • 内容完整性: ${result.dimensions.completeness}/100`);
      lines.push(`  • 逻辑结构: ${result.dimensions.structure}/100`);
      lines.push(`  • 语言表达: ${result.dimensions.language}/100`);
      lines.push(`  • 观点深度: ${result.dimensions.depth}/100`);
      lines.push('');
    }

    if (result.strengths?.length > 0) {
      lines.push('✅ 优点:');
      result.strengths.forEach((s) => lines.push(`  • ${s}`));
      lines.push('');
    }

    if (result.weaknesses?.length > 0) {
      lines.push('❌ 不足:');
      result.weaknesses.forEach((w) => lines.push(`  • ${w}`));
      lines.push('');
    }

    if (result.suggestions?.length > 0) {
      lines.push('💡 改进建议:');
      result.suggestions.forEach((s) => lines.push(`  • ${s}`));
      lines.push('');
    }

    if (result.sampleAnswer) {
      lines.push('📝 参考答案要点:');
      lines.push(result.sampleAnswer);
    }

    return lines.join('\n');
  }
}

// Singleton
let scorerInstance = null;

export function getScorer() {
  if (!scorerInstance) {
    scorerInstance = new Scorer();
  }
  return scorerInstance;
}
