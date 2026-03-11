import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Initialize database connection and create tables
 */
export function initDatabase() {
  if (db) {
    return db;
  }

  // Ensure data directory exists
  const dataDir = dirname(CONFIG.database.path);
  try {
    import('fs').then(({ mkdirSync }) => {
      mkdirSync(dataDir, { recursive: true });
    });
  } catch {
    // Directory may already exist
  }

  db = new Database(CONFIG.database.path);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Load and execute schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  logger.info('Database initialized', { path: CONFIG.database.path });

  return db;
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database closed');
  }
}

// ============ Exam Papers ============

export function createPaper(data) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO exam_papers (source, source_url, province, year, level, raw_content)
    VALUES (@source, @sourceUrl, @province, @year, @level, @rawContent)
  `);
  const result = stmt.run({
    source: data.source,
    sourceUrl: data.sourceUrl || null,
    province: data.province,
    year: data.year,
    level: data.level || null,
    rawContent: data.rawContent || null,
  });
  return result.lastInsertRowid;
}

export function findPaperByProvinceYear(province, year) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM exam_papers WHERE province = ? AND year = ?
  `);
  return stmt.get(province, year);
}

export function updatePaperProcessed(paperId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE exam_papers SET processed_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  stmt.run(paperId);
}

// ============ Questions ============

export function createQuestion(data) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO questions (paper_id, question_number, question_text, requirements, score, materials)
    VALUES (@paperId, @questionNumber, @questionText, @requirements, @score, @materials)
  `);
  const result = stmt.run({
    paperId: data.paperId,
    questionNumber: data.questionNumber,
    questionText: data.questionText,
    requirements: data.requirements || null,
    score: data.score || null,
    materials: data.materials || null,
  });
  return result.lastInsertRowid;
}

export function findQuestionsByPaper(paperId) {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM questions WHERE paper_id = ? ORDER BY question_number`);
  return stmt.all(paperId);
}

export function findRandomQuestion(province = null, year = null, excludeIds = []) {
  const db = getDatabase();
  let sql = `
    SELECT q.*, p.province, p.year, p.level
    FROM questions q
    JOIN exam_papers p ON q.paper_id = p.id
  `;
  const conditions = [];
  const params = [];

  if (province) {
    conditions.push('p.province = ?');
    params.push(province);
  }
  if (year) {
    conditions.push('p.year = ?');
    params.push(year);
  }
  if (excludeIds.length > 0) {
    conditions.push(`q.id NOT IN (${excludeIds.map(() => '?').join(',')})`);
    params.push(...excludeIds);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY RANDOM() LIMIT 1';

  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

// ============ Materials ============

export function createMaterial(data) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO materials (paper_id, material_number, content)
    VALUES (@paperId, @materialNumber, @content)
  `);
  const result = stmt.run({
    paperId: data.paperId,
    materialNumber: data.materialNumber,
    content: data.content,
  });
  return result.lastInsertRowid;
}

export function findMaterialsByPaper(paperId) {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM materials WHERE paper_id = ? ORDER BY material_number`);
  return stmt.all(paperId);
}

// ============ Problem-Doc Relations ============

export function createProblemDoc(data) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO problem_docs (question_id, material_id, verified)
    VALUES (@questionId, @materialId, @verified)
  `);
  const result = stmt.run({
    questionId: data.questionId,
    materialId: data.materialId,
    verified: data.verified || false,
  });
  return result.lastInsertRowid;
}

export function findMaterialsForQuestion(questionId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT m.* FROM materials m
    JOIN problem_docs pd ON m.id = pd.material_id
    WHERE pd.question_id = ?
    ORDER BY m.material_number
  `);
  return stmt.all(questionId);
}

// ============ User Sessions ============

export function createSession(sessionId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO user_sessions (id) VALUES (?)
  `);
  stmt.run(sessionId);
  return sessionId;
}

export function getSession(sessionId) {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM user_sessions WHERE id = ?`);
  return stmt.get(sessionId);
}

export function updateSession(sessionId, data) {
  const db = getDatabase();
  const fields = [];
  const values = [];

  if (data.currentQuestionId !== undefined) {
    fields.push('current_question_id = ?');
    values.push(data.currentQuestionId);
  }
  if (data.phase !== undefined) {
    fields.push('phase = ?');
    values.push(data.phase);
  }

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(sessionId);
    const stmt = db.prepare(`UPDATE user_sessions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }
}

// ============ Answer Records ============

export function createAnswerRecord(data) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO answer_records (session_id, question_id, user_answer, score, feedback)
    VALUES (@sessionId, @questionId, @userAnswer, @score, @feedback)
  `);
  const result = stmt.run({
    sessionId: data.sessionId,
    questionId: data.questionId,
    userAnswer: data.userAnswer || null,
    score: data.score || null,
    feedback: data.feedback || null,
  });
  return result.lastInsertRowid;
}

export function getAnsweredQuestionIds(sessionId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT DISTINCT question_id FROM answer_records WHERE session_id = ?
  `);
  const rows = stmt.all(sessionId);
  return rows.map((row) => row.question_id);
}

export function getAnswerHistory(sessionId, questionId = null) {
  const db = getDatabase();
  let sql = `SELECT * FROM answer_records WHERE session_id = ?`;
  const params = [sessionId];

  if (questionId) {
    sql += ` AND question_id = ?`;
    params.push(questionId);
  }

  sql += ` ORDER BY answered_at DESC`;

  const stmt = db.prepare(sql);
  return stmt.all(...params);
}
