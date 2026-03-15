import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 内联 schema（打包时使用）
const SCHEMA_SQL = `-- 试卷表
CREATE TABLE IF NOT EXISTS exam_papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_url TEXT,
    province TEXT NOT NULL,
    year INTEGER NOT NULL,
    level TEXT,
    raw_content TEXT,
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 题目表
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    requirements TEXT,
    score INTEGER,
    materials TEXT,
    FOREIGN KEY (paper_id) REFERENCES exam_papers(id)
);

-- 材料表
CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL,
    material_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    FOREIGN KEY (paper_id) REFERENCES exam_papers(id)
);

-- 题目材料关联表
CREATE TABLE IF NOT EXISTS problem_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (material_id) REFERENCES materials(id)
);

-- 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    current_question_id INTEGER,
    phase TEXT DEFAULT 'idle',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 答题记录表
CREATE TABLE IF NOT EXISTS answer_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    user_answer TEXT,
    score INTEGER,
    feedback TEXT,
    answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES user_sessions(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_questions_paper ON questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_materials_paper ON materials(paper_id);
CREATE INDEX IF NOT EXISTS idx_problem_docs_question ON problem_docs(question_id);
CREATE INDEX IF NOT EXISTS idx_answer_records_session ON answer_records(session_id);
`;

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
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  } catch {
    // Directory may already exist
  }

  db = new Database(CONFIG.database.path);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Execute schema (优先从文件读取，失败则使用内联版本)
  let schema = SCHEMA_SQL;
  try {
    const schemaPath = join(__dirname, 'schema.sql');
    if (existsSync(schemaPath)) {
      schema = readFileSync(schemaPath, 'utf-8');
    }
  } catch {
    // 使用内联 schema
  }
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
    verified: data.verified ? 1 : 0,  // SQLite用0/1代替boolean
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
  // 使用INSERT OR IGNORE避免重复插入
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO user_sessions (id) VALUES (?)
  `);
  stmt.run(sessionId);
  return sessionId;
}

export function getOrCreateSession(sessionId) {
  const db = getDatabase();
  let session = getSession(sessionId);
  if (!session) {
    createSession(sessionId);
    session = getSession(sessionId);
  }
  return session;
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

// ============ Smart Question Query ============

/**
 * 按条件查询题目列表
 * @param {object} options - 查询选项
 * @param {string} options.province - 省份
 * @param {number} options.year - 年份
 * @param {number} options.questionNumber - 题号
 * @param {string} options.level - 级别（国考/省考）
 * @returns {Array} 题目列表
 */
export function findQuestionsByConditions(options = {}) {
  const db = getDatabase();
  const { province, year, questionNumber, level } = options;

  let sql = `
    SELECT q.*, p.province, p.year, p.level
    FROM questions q
    JOIN exam_papers p ON q.paper_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (province) {
    sql += ` AND p.province LIKE ?`;
    params.push(`%${province}%`);
  }
  if (year) {
    sql += ` AND p.year = ?`;
    params.push(year);
  }
  if (questionNumber) {
    sql += ` AND q.question_number = ?`;
    params.push(questionNumber);
  }
  if (level) {
    sql += ` AND p.level LIKE ?`;
    params.push(`%${level}%`);
  }

  sql += ` ORDER BY p.year DESC, q.question_number ASC`;

  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

/**
 * 获取题目的历史答题记录（包含分数和时间）
 * @param {string} sessionId - 会话ID
 * @param {number} questionId - 题目ID
 * @returns {object|null} 最近一次答题记录
 */
export function getLatestAnswerRecord(sessionId, questionId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM answer_records
    WHERE session_id = ? AND question_id = ?
    ORDER BY answered_at DESC
    LIMIT 1
  `);
  return stmt.get(sessionId, questionId);
}

/**
 * 获取可用的省份列表
 * @returns {Array} 省份列表
 */
export function getAvailableProvinces() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT DISTINCT province FROM exam_papers ORDER BY province
  `);
  return stmt.all().map(row => row.province);
}

/**
 * 获取可用年份列表
 * @param {string} province - 省份（可选）
 * @returns {Array} 年份列表
 */
export function getAvailableYears(province = null) {
  const db = getDatabase();
  let sql = `SELECT DISTINCT year FROM exam_papers`;
  const params = [];

  if (province) {
    sql += ` WHERE province = ?`;
    params.push(province);
  }

  sql += ` ORDER BY year DESC`;

  const stmt = db.prepare(sql);
  return stmt.all(...params).map(row => row.year);
}

/**
 * 获取试卷统计信息
 * @returns {object} 统计信息
 */
export function getPaperStats() {
  const db = getDatabase();
  const papersStmt = db.prepare(`SELECT COUNT(*) as count FROM exam_papers`);
  const questionsStmt = db.prepare(`SELECT COUNT(*) as count FROM questions`);
  const processedStmt = db.prepare(`SELECT COUNT(*) as count FROM exam_papers WHERE processed_at IS NOT NULL`);

  return {
    totalPapers: papersStmt.get().count,
    totalQuestions: questionsStmt.get().count,
    processedPapers: processedStmt.get().count,
  };
}
