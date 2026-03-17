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

    // Create problem directory
    const problemDir = join(dataDir, 'problem');
    if (!existsSync(problemDir)) {
      mkdirSync(problemDir, { recursive: true });
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

    // Save materials to database
    for (const material of splitResult.materials) {
      const materialId = createMaterial({
        paperId: paper.id,
        materialNumber: material.number,
        content: material.content,
      });
      materialIds.push({ id: materialId, number: material.number, content: material.content });
    }

    // Save questions and create problem files
    for (const question of splitResult.questions) {
      const questionId = createQuestion({
        paperId: paper.id,
        questionNumber: question.number,
        questionText: question.text,
        requirements: question.requirements,
        score: question.score,
      });
      questionIds.push({ id: questionId, number: question.number });

      // Extract referenced material numbers from question text
      const referencedMaterials = this.extractReferencedMaterials(question.text);

      // Get related materials
      let relatedMaterials;
      if (referencedMaterials.length > 0) {
        // Use only referenced materials
        relatedMaterials = materialIds.filter(m => referencedMaterials.includes(m.number));
      } else {
        // Use all materials if no specific reference
        relatedMaterials = materialIds;
      }

      // Create problem file combining question + materials
      this.saveProblemFile(problemDir, question.number, question.text, question.requirements, relatedMaterials);

      // Create database relations
      for (const material of relatedMaterials) {
        createProblemDoc({
          questionId,
          materialId: material.id,
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
      materials: materialIds.map(m => ({ id: m.id, number: m.number })),
      verification,
    };
  }

  /**
   * Extract referenced material numbers from question text
   * e.g., "请根据材料2" -> [2], "根据材料1和材料3" -> [1, 3], "给定资料1" -> [1]
   * Also supports ranges like "给定资料1-4" -> [1, 2, 3, 4]
   */
  extractReferencedMaterials(text) {
    const numbers = [];

    // Match range patterns like "资料1-4", "材料1-3" first
    const rangeMatches = text.matchAll(/(?:材料|资料)(\d+)\s*[-–—~～至]\s*(\d+)/g);
    for (const match of rangeMatches) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      for (let i = start; i <= end; i++) {
        if (!numbers.includes(i)) {
          numbers.push(i);
        }
      }
    }

    // Match single patterns like "材料1", "资料1", "给定资料1"
    const matches = text.matchAll(/(?:材料|资料)(\d+)/g);
    for (const match of matches) {
      const num = parseInt(match[1], 10);
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }

    return numbers.sort((a, b) => a - b);
  }

  /**
   * Save problem file combining question and materials
   */
  saveProblemFile(problemDir, number, text, requirements, materials) {
    let content = `【题目 ${number}】\n${text}\n\n【要求】\n${requirements || '无特殊要求'}\n\n`;

    if (materials.length > 0) {
      content += `═══════════════════════════════════════\n`;
      content += `【给定材料】\n`;
      content += `═══════════════════════════════════════\n\n`;

      for (const material of materials) {
        content += `【材料 ${material.number}】\n`;
        content += `${material.content}\n\n`;
      }
    }

    const filePath = join(problemDir, `problem_${number}.txt`);
    writeFileSync(filePath, content, 'utf-8');
    logger.info('Saved problem file', { path: filePath, materialCount: materials.length });
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
