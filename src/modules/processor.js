import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';
import { getLLMClient } from '../llm/client.js';
import {
  findPaperByProvinceYear,
  updatePaperProcessed,
  createQuestion,
  createMaterial,
  createProblemDoc,
  findMaterialsByPaper,
} from '../db/index.js';

/**
 * Processor module for splitting exam content using LLM
 */
export class Processor {
  constructor() {
    this.llm = getLLMClient();
  }

  /**
   * Process a paper: split content into questions and materials
   */
  async processPaper(province, year) {
    logger.info('Processing paper', { province, year });

    const paper = findPaperByProvinceYear(province, year);
    if (!paper) {
      throw new Error(`Paper not found: ${province} ${year}`);
    }

    if (paper.processed_at) {
      logger.info('Paper already processed', { paperId: paper.id });
      return { alreadyProcessed: true, paperId: paper.id };
    }

    if (!paper.raw_content) {
      throw new Error('Paper has no raw content');
    }

    // Create data directory
    const dataDir = join(CONFIG.paths.data, `${province}省考_${year}`);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Split content using LLM
    logger.info('Splitting content with LLM');
    const splitResult = await this.llm.splitContent(paper.raw_content);

    // Verify split
    logger.info('Verifying split result');
    const verification = await this.llm.verifySplit(splitResult.questions, splitResult.materials);

    if (!verification.valid) {
      logger.warn('Split verification issues', { issues: verification.issues });
    }

    // Save to database
    const questionIds = [];
    const materialIds = [];

    // Save materials first
    for (const material of splitResult.materials) {
      const materialId = createMaterial({
        paperId: paper.id,
        materialNumber: material.number,
        content: material.content,
      });
      materialIds.push({ id: materialId, number: material.number });

      // Save to file
      this.saveMaterialFile(dataDir, material.number, material.content);
    }

    // Save questions
    for (const question of splitResult.questions) {
      const questionId = createQuestion({
        paperId: paper.id,
        questionNumber: question.number,
        questionText: question.text,
        requirements: question.requirements,
        score: question.score,
      });
      questionIds.push({ id: questionId, number: question.number });

      // Save to file
      this.saveQuestionFile(dataDir, question.number, question.text, question.requirements);

      // Create default relation with all materials
      // (This is a simplification - in reality, each question may reference specific materials)
      for (const materialId of materialIds) {
        createProblemDoc({
          questionId,
          materialId: materialId.id,
          verified: false,
        });
      }
    }

    // Mark paper as processed
    updatePaperProcessed(paper.id);

    logger.info('Paper processed', {
      paperId: paper.id,
      questionCount: questionIds.length,
      materialCount: materialIds.length,
    });

    return {
      alreadyProcessed: false,
      paperId: paper.id,
      questions: questionIds,
      materials: materialIds,
      verification,
    };
  }

  /**
   * Save material to file
   */
  saveMaterialFile(dataDir, number, content) {
    const problemDir = join(dataDir, `problem_${number}`);
    if (!existsSync(problemDir)) {
      mkdirSync(problemDir, { recursive: true });
    }
    const filePath = join(problemDir, 'document.txt');
    writeFileSync(filePath, content, 'utf-8');
    logger.debug('Saved material file', { path: filePath });
  }

  /**
   * Save question to file
   */
  saveQuestionFile(dataDir, number, text, requirements) {
    const problemDir = join(dataDir, `problem_${number}`);
    if (!existsSync(problemDir)) {
      mkdirSync(problemDir, { recursive: true });
    }
    const content = `【题目】\n${text}\n\n【要求】\n${requirements || '无特殊要求'}`;
    const filePath = join(problemDir, 'problem.txt');
    writeFileSync(filePath, content, 'utf-8');
    logger.debug('Saved question file', { path: filePath });
  }

  /**
   * Process content directly (without database)
   */
  async processContent(rawContent) {
    logger.info('Processing raw content');
    const splitResult = await this.llm.splitContent(rawContent);
    const verification = await this.llm.verifySplit(splitResult.questions, splitResult.materials);

    return {
      questions: splitResult.questions,
      materials: splitResult.materials,
      verification,
    };
  }
}

// Singleton
let processorInstance = null;

export function getProcessor() {
  if (!processorInstance) {
    processorInstance = new Processor();
  }
  return processorInstance;
}
