import { logger } from '../utils/logger.js';
import {
  findRandomQuestion,
  findMaterialsForQuestion,
  getAnsweredQuestionIds,
} from '../db/index.js';

/**
 * Question bank module for querying and managing questions
 */
export class QuestionBank {
  /**
   * Get a random question for practice
   */
  getRandomQuestion(sessionId, options = {}) {
    const { province, year } = options;

    // Get already answered questions
    const answeredIds = sessionId ? getAnsweredQuestionIds(sessionId) : [];

    const question = findRandomQuestion(province, year, answeredIds);

    if (!question) {
      logger.warn('No questions found', { province, year, excludedCount: answeredIds.length });
      return null;
    }

    logger.info('Random question selected', { questionId: question.id });

    return question;
  }

  /**
   * Get full question data with materials
   */
  getQuestionWithMaterials(questionId) {
    const materials = findMaterialsForQuestion(questionId);

    return {
      materials,
    };
  }

  /**
   * Get question stats
   */
  getStats(sessionId) {
    const answeredIds = sessionId ? getAnsweredQuestionIds(sessionId) : [];

    return {
      answeredCount: answeredIds.length,
    };
  }
}

// Singleton
let questionBankInstance = null;

export function getQuestionBank() {
  if (!questionBankInstance) {
    questionBankInstance = new QuestionBank();
  }
  return questionBankInstance;
}
