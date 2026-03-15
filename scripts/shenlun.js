#!/usr/bin/env node

// src/index.js
import { config as config2 } from "dotenv";
import { randomUUID } from "crypto";

// src/config.js
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
config();
var __dirname = dirname(fileURLToPath(import.meta.url));
var CONFIG = {
  llm: {
    baseUrl: process.env.LLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "glm-4-flash"
  },
  scraper: {
    baseUrl: process.env.SCRAPER_BASE_URL || "https://www.aipta.com"
  },
  database: {
    path: process.env.DATABASE_PATH || join(__dirname, "..", "data", "shenlun.db")
  },
  logging: {
    level: process.env.LOG_LEVEL || "info"
  },
  paths: {
    data: join(__dirname, "..", "data"),
    root: join(__dirname, "..")
  }
};
function validateConfig() {
  const errors = [];
  if (!CONFIG.llm.apiKey) {
    errors.push("LLM_API_KEY is required");
  }
  if (errors.length > 0) {
    throw new Error(`Configuration errors:
${errors.join("\n")}`);
  }
  return true;
}

// src/utils/logger.js
var LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var currentLevel = LEVELS[CONFIG.logging.level] ?? LEVELS.info;
function formatTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function formatMessage(level, message, meta = {}) {
  const timestamp = formatTimestamp();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}
var logger = {
  debug(message, meta = {}) {
    if (currentLevel <= LEVELS.debug) {
      console.debug(formatMessage("debug", message, meta));
    }
  },
  info(message, meta = {}) {
    if (currentLevel <= LEVELS.info) {
      console.info(formatMessage("info", message, meta));
    }
  },
  warn(message, meta = {}) {
    if (currentLevel <= LEVELS.warn) {
      console.warn(formatMessage("warn", message, meta));
    }
  },
  error(message, meta = {}) {
    if (currentLevel <= LEVELS.error) {
      console.error(formatMessage("error", message, meta));
    }
  }
};

// src/db/index.js
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname as dirname2, join as join2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var __dirname2 = dirname2(fileURLToPath2(import.meta.url));
var SCHEMA_SQL = `-- \u8BD5\u5377\u8868
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

-- \u9898\u76EE\u8868
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

-- \u6750\u6599\u8868
CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL,
    material_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    FOREIGN KEY (paper_id) REFERENCES exam_papers(id)
);

-- \u9898\u76EE\u6750\u6599\u5173\u8054\u8868
CREATE TABLE IF NOT EXISTS problem_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (material_id) REFERENCES materials(id)
);

-- \u7528\u6237\u4F1A\u8BDD\u8868
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    current_question_id INTEGER,
    phase TEXT DEFAULT 'idle',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- \u7B54\u9898\u8BB0\u5F55\u8868
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

-- \u7D22\u5F15
CREATE INDEX IF NOT EXISTS idx_questions_paper ON questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_materials_paper ON materials(paper_id);
CREATE INDEX IF NOT EXISTS idx_problem_docs_question ON problem_docs(question_id);
CREATE INDEX IF NOT EXISTS idx_answer_records_session ON answer_records(session_id);
`;
var db = null;
function initDatabase() {
  if (db) {
    return db;
  }
  const dataDir = dirname2(CONFIG.database.path);
  try {
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  } catch {
  }
  db = new Database(CONFIG.database.path);
  db.pragma("foreign_keys = ON");
  let schema = SCHEMA_SQL;
  try {
    const schemaPath = join2(__dirname2, "schema.sql");
    if (existsSync(schemaPath)) {
      schema = readFileSync(schemaPath, "utf-8");
    }
  } catch {
  }
  db.exec(schema);
  logger.info("Database initialized", { path: CONFIG.database.path });
  return db;
}
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info("Database closed");
  }
}
function createPaper(data) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    INSERT INTO exam_papers (source, source_url, province, year, level, raw_content)
    VALUES (@source, @sourceUrl, @province, @year, @level, @rawContent)
  `);
  const result = stmt.run({
    source: data.source,
    sourceUrl: data.sourceUrl || null,
    province: data.province,
    year: data.year,
    level: data.level || null,
    rawContent: data.rawContent || null
  });
  return result.lastInsertRowid;
}
function findPaperByProvinceYear(province, year) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    SELECT * FROM exam_papers WHERE province = ? AND year = ?
  `);
  return stmt.get(province, year);
}
function updatePaperProcessed(paperId) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    UPDATE exam_papers SET processed_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  stmt.run(paperId);
}
function createQuestion(data) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    INSERT INTO questions (paper_id, question_number, question_text, requirements, score, materials)
    VALUES (@paperId, @questionNumber, @questionText, @requirements, @score, @materials)
  `);
  const result = stmt.run({
    paperId: data.paperId,
    questionNumber: data.questionNumber,
    questionText: data.questionText,
    requirements: data.requirements || null,
    score: data.score || null,
    materials: data.materials || null
  });
  return result.lastInsertRowid;
}
function createMaterial(data) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    INSERT INTO materials (paper_id, material_number, content)
    VALUES (@paperId, @materialNumber, @content)
  `);
  const result = stmt.run({
    paperId: data.paperId,
    materialNumber: data.materialNumber,
    content: data.content
  });
  return result.lastInsertRowid;
}
function createProblemDoc(data) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    INSERT INTO problem_docs (question_id, material_id, verified)
    VALUES (@questionId, @materialId, @verified)
  `);
  const result = stmt.run({
    questionId: data.questionId,
    materialId: data.materialId,
    verified: data.verified ? 1 : 0
    // SQLite用0/1代替boolean
  });
  return result.lastInsertRowid;
}
function findMaterialsForQuestion(questionId) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    SELECT m.* FROM materials m
    JOIN problem_docs pd ON m.id = pd.material_id
    WHERE pd.question_id = ?
    ORDER BY m.material_number
  `);
  return stmt.all(questionId);
}
function createSession(sessionId) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    INSERT OR IGNORE INTO user_sessions (id) VALUES (?)
  `);
  stmt.run(sessionId);
  return sessionId;
}
function getSession(sessionId) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`SELECT * FROM user_sessions WHERE id = ?`);
  return stmt.get(sessionId);
}
function updateSession(sessionId, data) {
  const db2 = getDatabase();
  const fields = [];
  const values = [];
  if (data.currentQuestionId !== void 0) {
    fields.push("current_question_id = ?");
    values.push(data.currentQuestionId);
  }
  if (data.phase !== void 0) {
    fields.push("phase = ?");
    values.push(data.phase);
  }
  if (fields.length > 0) {
    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(sessionId);
    const stmt = db2.prepare(`UPDATE user_sessions SET ${fields.join(", ")} WHERE id = ?`);
    stmt.run(...values);
  }
}
function createAnswerRecord(data) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    INSERT INTO answer_records (session_id, question_id, user_answer, score, feedback)
    VALUES (@sessionId, @questionId, @userAnswer, @score, @feedback)
  `);
  const result = stmt.run({
    sessionId: data.sessionId,
    questionId: data.questionId,
    userAnswer: data.userAnswer || null,
    score: data.score || null,
    feedback: data.feedback || null
  });
  return result.lastInsertRowid;
}
function getAnsweredQuestionIds(sessionId) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    SELECT DISTINCT question_id FROM answer_records WHERE session_id = ?
  `);
  const rows = stmt.all(sessionId);
  return rows.map((row) => row.question_id);
}
function findQuestionsByConditions(options = {}) {
  const db2 = getDatabase();
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
  const stmt = db2.prepare(sql);
  return stmt.all(...params);
}
function getLatestAnswerRecord(sessionId, questionId) {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    SELECT * FROM answer_records
    WHERE session_id = ? AND question_id = ?
    ORDER BY answered_at DESC
    LIMIT 1
  `);
  return stmt.get(sessionId, questionId);
}
function getAvailableProvinces() {
  const db2 = getDatabase();
  const stmt = db2.prepare(`
    SELECT DISTINCT province FROM exam_papers ORDER BY province
  `);
  return stmt.all().map((row) => row.province);
}
function getAvailableYears(province = null) {
  const db2 = getDatabase();
  let sql = `SELECT DISTINCT year FROM exam_papers`;
  const params = [];
  if (province) {
    sql += ` WHERE province = ?`;
    params.push(province);
  }
  sql += ` ORDER BY year DESC`;
  const stmt = db2.prepare(sql);
  return stmt.all(...params).map((row) => row.year);
}
function getPaperStats() {
  const db2 = getDatabase();
  const papersStmt = db2.prepare(`SELECT COUNT(*) as count FROM exam_papers`);
  const questionsStmt = db2.prepare(`SELECT COUNT(*) as count FROM questions`);
  const processedStmt = db2.prepare(`SELECT COUNT(*) as count FROM exam_papers WHERE processed_at IS NOT NULL`);
  return {
    totalPapers: papersStmt.get().count,
    totalQuestions: questionsStmt.get().count,
    processedPapers: processedStmt.get().count
  };
}

// src/modules/scraper.js
import { JSDOM } from "jsdom";

// src/utils/http-client.js
async function httpClient(url, options = {}) {
  const { retries = 3, timeout = 3e4, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      logger.warn(`HTTP request failed (attempt ${attempt}/${retries})`, {
        url: url.toString(),
        error: error.message
      });
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1e3 * attempt));
      }
    }
  }
  clearTimeout(timeoutId);
  throw lastError;
}
async function fetchHtml(url) {
  return httpClient(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
    }
  });
}

// src/modules/scraper.js
import { mkdirSync as mkdirSync2, writeFileSync, existsSync as existsSync2 } from "fs";
import { join as join3 } from "path";
var Scraper = class {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || CONFIG.scraper.baseUrl;
  }
  /**
   * Scrape exam paper from aipta.com
   */
  async scrapePaper(province, year) {
    logger.info("Starting scrape", { province, year });
    const existing = findPaperByProvinceYear(province, year);
    if (existing) {
      logger.info("Paper already exists", { paperId: existing.id });
      return { existing: true, paperId: existing.id };
    }
    try {
      const articleUrl = await this.findPaperFromZtPage(province, year);
      if (!articleUrl) {
        throw new Error(`\u672A\u627E\u5230 ${province} ${year} \u5E74\u7684\u8BD5\u5377`);
      }
      logger.info("Found paper URL", { url: articleUrl });
      const html = await fetchHtml(articleUrl);
      const content = this.parseArticleContent(html);
      if (!content) {
        throw new Error("Failed to parse paper content");
      }
      const dataDir = join3(CONFIG.paths.data, `${province}\u7701\u8003_${year}`);
      if (!existsSync2(dataDir)) {
        mkdirSync2(dataDir, { recursive: true });
      }
      const originPath = join3(dataDir, "origin.txt");
      writeFileSync(originPath, content, "utf-8");
      logger.info("Saved raw content", { path: originPath });
      const paperId = createPaper({
        source: "aipta",
        sourceUrl: articleUrl,
        province,
        year,
        rawContent: content
      });
      logger.info("Paper created", { paperId });
      return { existing: false, paperId, content, dataDir };
    } catch (error) {
      logger.error("Scrape failed", { province, year, error: error.message });
      throw error;
    }
  }
  /**
   * 从专题页面获取试卷链接
   */
  async findPaperFromZtPage(province, year) {
    const provinceCode = this.getProvinceCode(province);
    const ztUrl = `${this.baseUrl}/zt/sk/${provinceCode}/sl/`;
    logger.debug("Fetching zt page", { url: ztUrl });
    const html = await fetchHtml(ztUrl);
    const linkPattern = /href="([^"]*\/article\/\d+\.html)"[^>]*title="([^"]+)"[^>]*>/g;
    const matches = [];
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2];
      matches.push({ url, title });
    }
    logger.debug("Found articles on zt page", { count: matches.length });
    const yearStr = String(year);
    for (const item of matches) {
      if (item.title.includes(yearStr) && item.title.includes("\u7533\u8BBA")) {
        if (item.title.includes("\u7701\u5E02\u5377") || item.title.includes("\u901A\u7528\u5377")) {
          logger.info("Matched paper", { title: item.title, url: item.url });
          return item.url;
        }
      }
    }
    for (const item of matches) {
      if (item.title.includes(yearStr) && item.title.includes("\u7533\u8BBA")) {
        logger.info("Matched paper (fallback)", { title: item.title, url: item.url });
        return item.url;
      }
    }
    return null;
  }
  /**
   * Parse article content from HTML
   */
  parseArticleContent(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const selectors = [
      ".article-content",
      ".content",
      ".paper-content",
      "article",
      ".main-content",
      ".post-content",
      "#content"
    ];
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const text = element.textContent.replace(/\s+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
        if (text.length > 500) {
          return text;
        }
      }
    }
    const body = doc.body;
    if (body) {
      const text = body.textContent.replace(/\s+/g, " ").trim();
      if (text.length > 100) {
        return text;
      }
    }
    return null;
  }
  /**
   * Get province code for URL building
   */
  getProvinceCode(province) {
    const codes = {
      \u5317\u4EAC: "bj",
      \u4E0A\u6D77: "sh",
      \u5929\u6D25: "tj",
      \u91CD\u5E86: "cq",
      \u5E7F\u4E1C: "gd",
      \u6C5F\u82CF: "js",
      \u6D59\u6C5F: "zj",
      \u5C71\u4E1C: "sd",
      \u6CB3\u5357: "hn",
      \u56DB\u5DDD: "sc",
      \u6E56\u5357: "hn",
      \u6E56\u5317: "hb",
      \u5B89\u5FBD: "ah",
      \u798F\u5EFA: "fj",
      \u6C5F\u897F: "jx",
      \u6CB3\u5317: "he",
      \u5C71\u897F: "sx",
      \u8FBD\u5B81: "ln",
      \u5409\u6797: "jl",
      \u9ED1\u9F99\u6C5F: "hlj",
      \u5E7F\u897F: "gx",
      \u6D77\u5357: "han",
      \u8D35\u5DDE: "gz",
      \u4E91\u5357: "yn",
      \u9655\u897F: "sn",
      \u7518\u8083: "gs",
      \u9752\u6D77: "qh",
      \u5185\u8499\u53E4: "nmg",
      \u65B0\u7586: "xj",
      \u897F\u85CF: "xz",
      \u5B81\u590F: "nx"
    };
    return codes[province] || province.toLowerCase();
  }
};
var scraperInstance = null;
function getScraper() {
  if (!scraperInstance) {
    scraperInstance = new Scraper();
  }
  return scraperInstance;
}

// src/modules/processor.js
import { writeFileSync as writeFileSync2, existsSync as existsSync3, mkdirSync as mkdirSync3 } from "fs";
import { join as join4 } from "path";

// src/llm/client.js
var LLMClient = class {
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
      max_tokens: options.maxTokens ?? 4096
    };
    logger.debug("LLM request", { model: body.model, messageCount: messages.length });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await response.text();
      logger.error("LLM request failed", { status: response.status, error });
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    logger.debug("LLM response", { contentLength: content.length });
    return content;
  }
  /**
   * Split exam content into questions and materials
   */
  async splitContent(rawContent) {
    const prompt = `\u4F60\u662F\u4E00\u4E2A\u7533\u8BBA\u8BD5\u5377\u89E3\u6790\u4E13\u5BB6\u3002\u8BF7\u5C06\u4EE5\u4E0B\u7533\u8BBA\u8BD5\u5377\u5185\u5BB9\u62C6\u5206\u4E3A\u9898\u76EE\u548C\u6750\u6599\u3002

\u8981\u6C42\uFF1A
1. \u8BC6\u522B\u6240\u6709\u9898\u76EE\uFF08\u5305\u62EC\u9898\u76EE\u7F16\u53F7\u3001\u9898\u76EE\u8981\u6C42\u3001\u5206\u503C\uFF09
2. \u8BC6\u522B\u6240\u6709\u6750\u6599\uFF08\u5305\u62EC\u6750\u6599\u7F16\u53F7\u3001\u6750\u6599\u5185\u5BB9\uFF09
3. \u8F93\u51FAJSON\u683C\u5F0F

\u8F93\u51FA\u683C\u5F0F\u793A\u4F8B\uFF1A
{
  "questions": [
    {
      "number": 1,
      "text": "\u9898\u76EE\u5185\u5BB9",
      "requirements": "\u4F5C\u7B54\u8981\u6C42",
      "score": 20
    }
  ],
  "materials": [
    {
      "number": 1,
      "content": "\u6750\u6599\u5185\u5BB9"
    }
  ]
}

\u8BD5\u5377\u5185\u5BB9\uFF1A
${rawContent}`;
    const response = await this.chat([
      { role: "system", content: "\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u7533\u8BBA\u8BD5\u5377\u89E3\u6790\u52A9\u624B\uFF0C\u64C5\u957F\u7ED3\u6784\u5316\u63D0\u53D6\u8BD5\u5377\u5185\u5BB9\u3002" },
      { role: "user", content: prompt }
    ]);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse LLM response as JSON");
    }
    return JSON.parse(jsonMatch[0]);
  }
  /**
   * Verify split results
   */
  async verifySplit(questions, materials) {
    const prompt = `\u8BF7\u9A8C\u8BC1\u4EE5\u4E0B\u9898\u76EE\u548C\u6750\u6599\u7684\u62C6\u5206\u662F\u5426\u6B63\u786E\uFF1A

\u9898\u76EE\u6570\u91CF: ${questions.length}
\u6750\u6599\u6570\u91CF: ${materials.length}

\u9898\u76EE\u5217\u8868:
${questions.map((q) => `- \u7B2C${q.number}\u9898: ${q.text.substring(0, 100)}...`).join("\n")}

\u6750\u6599\u5217\u8868:
${materials.map((m) => `- \u6750\u6599${m.number}: ${m.content.substring(0, 100)}...`).join("\n")}

\u8BF7\u68C0\u67E5\uFF1A
1. \u9898\u76EE\u7F16\u53F7\u662F\u5426\u8FDE\u7EED
2. \u6750\u6599\u7F16\u53F7\u662F\u5426\u8FDE\u7EED
3. \u662F\u5426\u6709\u9057\u6F0F\u7684\u5185\u5BB9
4. \u62C6\u5206\u662F\u5426\u51C6\u786E

\u56DE\u590D\u683C\u5F0F\uFF1A
{
  "valid": true/false,
  "issues": ["\u95EE\u98981", "\u95EE\u98982"],
  "suggestions": ["\u5EFA\u8BAE1"]
}`;
    const response = await this.chat([
      { role: "system", content: "\u4F60\u662F\u4E00\u4E2A\u7533\u8BBA\u8BD5\u5377\u5BA1\u6838\u4E13\u5BB6\uFF0C\u8D1F\u8D23\u9A8C\u8BC1\u89E3\u6790\u7ED3\u679C\u7684\u51C6\u786E\u6027\u3002" },
      { role: "user", content: prompt }
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
    const materialsText = materials.map((m) => `\u3010\u6750\u6599${m.number || m.material_number}\u3011
${m.content}`).join("\n\n");
    let prompt;
    if (userThought) {
      prompt = `\u7528\u6237\u5BF9\u4EE5\u4E0B\u7533\u8BBA\u9898\u76EE\u7684\u601D\u8003\uFF1A

\u3010\u9898\u76EE\u3011
${question.question_text}

\u3010\u6750\u6599\u3011
${materialsText}

\u3010\u7528\u6237\u7684\u601D\u8003\u3011
${userThought}

\u8BF7\uFF1A
1. \u5206\u6790\u7528\u6237\u7684\u601D\u8DEF\u662F\u5426\u6B63\u786E
2. \u6307\u51FA\u53EF\u80FD\u7684\u9057\u6F0F\u6216\u504F\u5DEE
3. \u63D0\u4F9B\u66F4\u6DF1\u5165\u7684\u601D\u8003\u89D2\u5EA6
4. \u7ED9\u51FA\u7ED3\u6784\u5316\u7684\u7B54\u9898\u5EFA\u8BAE

\u56DE\u590D\u8981\u6C42\uFF1A
- \u5148\u80AF\u5B9A\u7528\u6237\u7684\u6B63\u786E\u7406\u89E3
- \u518D\u6307\u51FA\u9700\u8981\u6539\u8FDB\u7684\u5730\u65B9
- \u6700\u540E\u63D0\u4F9B\u5177\u4F53\u7684\u7B54\u9898\u6846\u67B6`;
    } else {
      prompt = `\u8BF7\u5F15\u5BFC\u7528\u6237\u601D\u8003\u4EE5\u4E0B\u7533\u8BBA\u9898\u76EE\uFF1A

\u3010\u9898\u76EE\u3011
${question.question_text}

\u3010\u8981\u6C42\u3011
${question.requirements || "\u65E0\u7279\u6B8A\u8981\u6C42"}

\u3010\u6750\u6599\u3011
${materialsText}

\u8BF7\uFF1A
1. \u63D0\u51FA\u5F15\u5BFC\u6027\u95EE\u9898\uFF0C\u5E2E\u52A9\u7528\u6237\u7406\u89E3\u9898\u76EE
2. \u6307\u51FA\u6750\u6599\u4E2D\u7684\u5173\u952E\u4FE1\u606F\u70B9
3. \u63D0\u4F9B\u7B54\u9898\u601D\u8DEF\u7684\u6846\u67B6
4. \u4E0D\u8981\u76F4\u63A5\u7ED9\u51FA\u7B54\u6848

\u56DE\u590D\u8981\u6C42\uFF1A
- \u7528\u542F\u53D1\u5F0F\u63D0\u95EE\u5F15\u5BFC
- \u5FAA\u5E8F\u6E10\u8FDB\uFF0C\u4E0D\u8981\u4E00\u6B21\u6027\u7ED9\u51FA\u592A\u591A\u4FE1\u606F
- \u9F13\u52B1\u7528\u6237\u4E3B\u52A8\u601D\u8003`;
    }
    return await this.chat([
      {
        role: "system",
        content: "\u4F60\u662F\u4E00\u4E2A\u7ECF\u9A8C\u4E30\u5BCC\u7684\u7533\u8BBA\u8F85\u5BFC\u8001\u5E08\uFF0C\u64C5\u957F\u5F15\u5BFC\u5B66\u751F\u601D\u8003\uFF0C\u800C\u4E0D\u662F\u76F4\u63A5\u7ED9\u7B54\u6848\u3002"
      },
      { role: "user", content: prompt }
    ]);
  }
  /**
   * Score user answer
   */
  async scoreAnswer(question, materials, userAnswer) {
    const materialsText = materials.map((m) => `\u3010\u6750\u6599${m.number || m.material_number}\u3011
${m.content}`).join("\n\n");
    const prompt = `\u8BF7\u8BC4\u5206\u4EE5\u4E0B\u7533\u8BBA\u7B54\u6848\uFF1A

\u3010\u9898\u76EE\u3011
${question.question_text}

\u3010\u8981\u6C42\u3011
${question.requirements || "\u65E0\u7279\u6B8A\u8981\u6C42"}
${question.score ? `\uFF08\u6EE1\u5206${question.score}\u5206\uFF09` : ""}

\u3010\u6750\u6599\u3011
${materialsText}

\u3010\u7528\u6237\u7B54\u6848\u3011
${userAnswer}

\u8BF7\u4ECE\u4EE5\u4E0B\u7EF4\u5EA6\u8BC4\u5206\uFF1A
1. \u5185\u5BB9\u5B8C\u6574\u6027 (0-100)\uFF1A\u662F\u5426\u8986\u76D6\u6240\u6709\u8981\u70B9
2. \u903B\u8F91\u7ED3\u6784 (0-100)\uFF1A\u7ED3\u6784\u662F\u5426\u6E05\u6670\u5408\u7406
3. \u8BED\u8A00\u8868\u8FBE (0-100)\uFF1A\u8BED\u8A00\u662F\u5426\u89C4\u8303\u6D41\u7545
4. \u89C2\u70B9\u6DF1\u5EA6 (0-100)\uFF1A\u5206\u6790\u662F\u5426\u6DF1\u5165\u5230\u4F4D

\u56DE\u590D\u683C\u5F0F\uFF1A
{
  "score": \u603B\u5206,
  "dimensions": {
    "completeness": \u5206\u6570,
    "structure": \u5206\u6570,
    "language": \u5206\u6570,
    "depth": \u5206\u6570
  },
  "strengths": ["\u4F18\u70B91", "\u4F18\u70B92"],
  "weaknesses": ["\u4E0D\u8DB31", "\u4E0D\u8DB32"],
  "suggestions": ["\u6539\u8FDB\u5EFA\u8BAE1", "\u6539\u8FDB\u5EFA\u8BAE2"],
  "sampleAnswer": "\u53C2\u8003\u7B54\u6848\u8981\u70B9"
}`;
    const response = await this.chat([
      {
        role: "system",
        content: "\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u7533\u8BBA\u9605\u5377\u4E13\u5BB6\uFF0C\u8BC4\u5206\u516C\u6B63\u5BA2\u89C2\uFF0C\u53CD\u9988\u8BE6\u7EC6\u6709\u5EFA\u8BBE\u6027\u3002"
      },
      { role: "user", content: prompt }
    ]);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        score: 60,
        dimensions: { completeness: 60, structure: 60, language: 60, depth: 60 },
        strengths: ["\u5DF2\u4F5C\u7B54"],
        weaknesses: ["\u9700\u8981\u66F4\u8BE6\u7EC6\u7684\u5206\u6790"],
        suggestions: ["\u8BF7\u53C2\u8003\u9898\u76EE\u8981\u6C42\u91CD\u65B0\u7EC4\u7EC7\u7B54\u6848"],
        rawFeedback: response
      };
    }
    return JSON.parse(jsonMatch[0]);
  }
};
var clientInstance = null;
function getLLMClient() {
  if (!clientInstance) {
    clientInstance = new LLMClient();
  }
  return clientInstance;
}

// src/modules/processor.js
var Processor = class {
  constructor() {
    this.llm = getLLMClient();
  }
  /**
   * Process a paper: split content into questions and materials
   */
  async processPaper(province, year) {
    logger.info("Processing paper", { province, year });
    const paper = findPaperByProvinceYear(province, year);
    if (!paper) {
      throw new Error(`Paper not found: ${province} ${year}`);
    }
    if (paper.processed_at) {
      logger.info("Paper already processed", { paperId: paper.id });
      return { alreadyProcessed: true, paperId: paper.id };
    }
    if (!paper.raw_content) {
      throw new Error("Paper has no raw content");
    }
    const dataDir = join4(CONFIG.paths.data, `${province}\u7701\u8003_${year}`);
    if (!existsSync3(dataDir)) {
      mkdirSync3(dataDir, { recursive: true });
    }
    logger.info("Splitting content with LLM");
    const splitResult = await this.llm.splitContent(paper.raw_content);
    logger.info("Verifying split result");
    const verification = await this.llm.verifySplit(splitResult.questions, splitResult.materials);
    if (!verification.valid) {
      logger.warn("Split verification issues", { issues: verification.issues });
    }
    const questionIds = [];
    const materialIds = [];
    for (const material of splitResult.materials) {
      const materialId = createMaterial({
        paperId: paper.id,
        materialNumber: material.number,
        content: material.content
      });
      materialIds.push({ id: materialId, number: material.number });
      this.saveMaterialFile(dataDir, material.number, material.content);
    }
    for (const question of splitResult.questions) {
      const questionId = createQuestion({
        paperId: paper.id,
        questionNumber: question.number,
        questionText: question.text,
        requirements: question.requirements,
        score: question.score
      });
      questionIds.push({ id: questionId, number: question.number });
      this.saveQuestionFile(dataDir, question.number, question.text, question.requirements);
      for (const materialId of materialIds) {
        createProblemDoc({
          questionId,
          materialId: materialId.id,
          verified: false
        });
      }
    }
    updatePaperProcessed(paper.id);
    logger.info("Paper processed", {
      paperId: paper.id,
      questionCount: questionIds.length,
      materialCount: materialIds.length
    });
    return {
      alreadyProcessed: false,
      paperId: paper.id,
      questions: questionIds,
      materials: materialIds,
      verification
    };
  }
  /**
   * Save material to file
   */
  saveMaterialFile(dataDir, number, content) {
    const problemDir = join4(dataDir, `problem_${number}`);
    if (!existsSync3(problemDir)) {
      mkdirSync3(problemDir, { recursive: true });
    }
    const filePath = join4(problemDir, "document.txt");
    writeFileSync2(filePath, content, "utf-8");
    logger.debug("Saved material file", { path: filePath });
  }
  /**
   * Save question to file
   */
  saveQuestionFile(dataDir, number, text, requirements) {
    const problemDir = join4(dataDir, `problem_${number}`);
    if (!existsSync3(problemDir)) {
      mkdirSync3(problemDir, { recursive: true });
    }
    const content = `\u3010\u9898\u76EE\u3011
${text}

\u3010\u8981\u6C42\u3011
${requirements || "\u65E0\u7279\u6B8A\u8981\u6C42"}`;
    const filePath = join4(problemDir, "problem.txt");
    writeFileSync2(filePath, content, "utf-8");
    logger.debug("Saved question file", { path: filePath });
  }
  /**
   * Process content directly (without database)
   */
  async processContent(rawContent) {
    logger.info("Processing raw content");
    const splitResult = await this.llm.splitContent(rawContent);
    const verification = await this.llm.verifySplit(splitResult.questions, splitResult.materials);
    return {
      questions: splitResult.questions,
      materials: splitResult.materials,
      verification
    };
  }
};
var processorInstance = null;
function getProcessor() {
  if (!processorInstance) {
    processorInstance = new Processor();
  }
  return processorInstance;
}

// src/modules/tutor.js
var Tutor = class {
  constructor() {
    this.llm = getLLMClient();
  }
  /**
   * Start guidance for a question
   */
  async startGuidance(question) {
    logger.info("Starting guidance", { questionId: question.id });
    const materials = findMaterialsForQuestion(question.id);
    const guidance = await this.llm.guideThinking(question, materials);
    return {
      phase: "thinking",
      question,
      materials,
      guidance
    };
  }
  /**
   * Analyze user's thinking
   */
  async analyzeThinking(question, userThought) {
    logger.info("Analyzing thinking", { questionId: question.id });
    const materials = findMaterialsForQuestion(question.id);
    const analysis = await this.llm.guideThinking(question, materials, userThought);
    return {
      phase: "analysis",
      analysis
    };
  }
  /**
   * Provide hints without giving away the answer
   */
  async provideHint(question, currentProgress) {
    const materials = findMaterialsForQuestion(question.id);
    const prompt = `\u5B66\u751F\u6B63\u5728\u89E3\u7B54\u4EE5\u4E0B\u7533\u8BBA\u9898\u76EE\uFF0C\u5DF2\u7ECF\u5B8C\u6210\u4E86\u90E8\u5206\u601D\u8003\u3002\u8BF7\u63D0\u4F9B\u4E00\u4E2A\u63D0\u793A\uFF0C\u5E2E\u52A9\u4ED6\u7EE7\u7EED\u524D\u8FDB\uFF0C\u4F46\u4E0D\u8981\u76F4\u63A5\u7ED9\u51FA\u7B54\u6848\u3002

\u3010\u9898\u76EE\u3011
${question.question_text}

\u3010\u6750\u6599\u3011
${materials.map((m) => `\u6750\u6599${m.material_number}: ${m.content.substring(0, 200)}...`).join("\n")}

\u3010\u5B66\u751F\u76EE\u524D\u7684\u8FDB\u5C55\u3011
${currentProgress}

\u8BF7\u63D0\u4F9B\u4E00\u4E2A\u5F15\u5BFC\u6027\u7684\u63D0\u793A\uFF082-3\u53E5\u8BDD\uFF09\uFF1A`;
    const hint = await this.llm.chat([
      {
        role: "system",
        content: "\u4F60\u662F\u4E00\u4E2A\u5584\u4E8E\u5F15\u5BFC\u7684\u7533\u8BBA\u8001\u5E08\uFF0C\u7ED9\u5B66\u751F\u6070\u5230\u597D\u5904\u7684\u63D0\u793A\u3002"
      },
      { role: "user", content: prompt }
    ]);
    return { hint };
  }
  /**
   * Expand on a topic from multiple angles
   */
  async expandTopic(question, topic) {
    const prompt = `\u5173\u4E8E\u7533\u8BBA\u9898\u76EE\u7684\u67D0\u4E2A\u65B9\u9762\uFF0C\u8BF7\u4ECE\u591A\u4E2A\u89D2\u5EA6\u8FDB\u884C\u62D3\u5C55\u5206\u6790\u3002

\u3010\u9898\u76EE\u3011
${question.question_text}

\u3010\u5173\u6CE8\u70B9\u3011
${topic}

\u8BF7\u4ECE\u4EE5\u4E0B\u89D2\u5EA6\u8FDB\u884C\u62D3\u5C55\uFF1A
1. \u653F\u7B56\u89D2\u5EA6\uFF1A\u76F8\u5173\u7684\u653F\u7B56\u6CD5\u89C4
2. \u793E\u4F1A\u89D2\u5EA6\uFF1A\u793E\u4F1A\u5F71\u54CD\u548C\u516C\u4F17\u53CD\u5E94
3. \u7ECF\u6D4E\u89D2\u5EA6\uFF1A\u7ECF\u6D4E\u6210\u672C\u548C\u6548\u76CA
4. \u5B9E\u8DF5\u89D2\u5EA6\uFF1A\u5177\u4F53\u53EF\u884C\u7684\u63AA\u65BD

\u6BCF\u4E2A\u89D2\u5EA6\u8BF7\u75282-3\u53E5\u8BDD\u7B80\u8981\u8BF4\u660E\u3002`;
    const expansion = await this.llm.chat([
      {
        role: "system",
        content: "\u4F60\u662F\u4E00\u4E2A\u77E5\u8BC6\u6E0A\u535A\u7684\u7533\u8BBA\u8001\u5E08\uFF0C\u64C5\u957F\u591A\u89D2\u5EA6\u5206\u6790\u95EE\u9898\u3002"
      },
      { role: "user", content: prompt }
    ]);
    return { expansion };
  }
};
var tutorInstance = null;
function getTutor() {
  if (!tutorInstance) {
    tutorInstance = new Tutor();
  }
  return tutorInstance;
}

// src/modules/scorer.js
var Scorer = class {
  constructor() {
    this.llm = getLLMClient();
  }
  /**
   * Score a user's answer
   */
  async scoreAnswer(sessionId, question, userAnswer) {
    logger.info("Scoring answer", { sessionId, questionId: question.id });
    const materials = findMaterialsForQuestion(question.id);
    const result = await this.llm.scoreAnswer(question, materials, userAnswer);
    const recordId = createAnswerRecord({
      sessionId,
      questionId: question.id,
      userAnswer,
      score: result.score,
      feedback: JSON.stringify(result)
    });
    logger.info("Answer scored", { recordId, score: result.score });
    return {
      recordId,
      ...result
    };
  }
  /**
   * Get detailed feedback
   */
  formatFeedback(result) {
    const lines = [];
    lines.push(`\u{1F4CA} \u603B\u5206: ${result.score}/100`);
    lines.push("");
    if (result.dimensions) {
      lines.push("\u{1F4C8} \u5404\u7EF4\u5EA6\u5F97\u5206:");
      lines.push(`  \u2022 \u5185\u5BB9\u5B8C\u6574\u6027: ${result.dimensions.completeness}/100`);
      lines.push(`  \u2022 \u903B\u8F91\u7ED3\u6784: ${result.dimensions.structure}/100`);
      lines.push(`  \u2022 \u8BED\u8A00\u8868\u8FBE: ${result.dimensions.language}/100`);
      lines.push(`  \u2022 \u89C2\u70B9\u6DF1\u5EA6: ${result.dimensions.depth}/100`);
      lines.push("");
    }
    if (result.strengths?.length > 0) {
      lines.push("\u2705 \u4F18\u70B9:");
      result.strengths.forEach((s) => lines.push(`  \u2022 ${s}`));
      lines.push("");
    }
    if (result.weaknesses?.length > 0) {
      lines.push("\u274C \u4E0D\u8DB3:");
      result.weaknesses.forEach((w) => lines.push(`  \u2022 ${w}`));
      lines.push("");
    }
    if (result.suggestions?.length > 0) {
      lines.push("\u{1F4A1} \u6539\u8FDB\u5EFA\u8BAE:");
      result.suggestions.forEach((s) => lines.push(`  \u2022 ${s}`));
      lines.push("");
    }
    if (result.sampleAnswer) {
      lines.push("\u{1F4DD} \u53C2\u8003\u7B54\u6848\u8981\u70B9:");
      lines.push(result.sampleAnswer);
    }
    return lines.join("\n");
  }
};
var scorerInstance = null;
function getScorer() {
  if (!scorerInstance) {
    scorerInstance = new Scorer();
  }
  return scorerInstance;
}

// src/index.js
config2();
function parseQuestionRequest(input) {
  const result = {
    province: null,
    year: null,
    questionNumber: null,
    random: false
  };
  if (/随机|随便|任意/.test(input)) {
    result.random = true;
  }
  const provinceMatch = input.match(/(\w+)(?:省|省考)?/);
  if (provinceMatch && provinceMatch[1] && !["\u968F\u673A", "\u968F\u4FBF", "\u4EFB\u610F", "\u4E00\u9053", "\u7ED9\u6211"].includes(provinceMatch[1])) {
    result.province = provinceMatch[1];
  }
  const yearMatch = input.match(/(\d{4})/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1]);
  }
  const numberMatch = input.match(/第?(\d+|[一二三四五])[题]?/);
  if (numberMatch) {
    const numMap = { "\u4E00": 1, "\u4E8C": 2, "\u4E09": 3, "\u56DB": 4, "\u4E94": 5 };
    result.questionNumber = numMap[numberMatch[1]] || parseInt(numberMatch[1]);
  }
  if (/国考/.test(input)) {
    result.level = "\u56FD\u8003";
  }
  return result;
}
var INTENT_PATTERNS = {
  give_question: [/出题/, /来一题/, /给我.*题/, /下一题/, /随机.*题/, /一道题/, /练.*题/],
  submit_answer: [/答案[是为]/, /我的答案/, /作答/, /提交/, /回答[是为]/],
  start_guide: [/开始/, /怎么答/, /如何思考/, /引导/],
  analyze_thought: [/我的思路/, /我想/, /我是这样想/],
  request_hint: [/提示/, /暗示/, /点拨/, /给点提示/],
  request_score: [/评分/, /打分/, /多少分/, /得分/],
  scrape_paper: [/爬取/, /下载.*试卷/, /抓取/],
  process_paper: [/处理.*试卷/, /解析.*试卷/],
  help: [/帮助/, /help/, /怎么用/, /功能/],
  stats: [/统计/, /进度/, /做了多少/],
  list_papers: [/有哪些.*试卷/, /可用.*试卷/, /试卷列表/]
};
function recognizeIntent(input) {
  const normalizedInput = input.toLowerCase().trim();
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedInput)) {
        return intent;
      }
    }
  }
  return "unknown";
}
var ShenLunTeacherSkill = class {
  constructor() {
    this.scraper = getScraper();
    this.processor = getProcessor();
    this.tutor = getTutor();
    this.scorer = getScorer();
  }
  /**
   * Initialize the skill
   */
  async initialize() {
    try {
      validateConfig();
      initDatabase();
      logger.info("ShenLun Teacher Skill initialized");
      return true;
    } catch (error) {
      logger.error("Initialization failed", { error: error.message });
      throw error;
    }
  }
  // ==================== 数据管理功能 ====================
  /**
   * 爬取指定省份和年份的试卷
   */
  async scrapePaper(province, year) {
    return await this.scraper.scrapePaper(province, year);
  }
  /**
   * 解析试卷，拆分题目和材料
   */
  async processPaper(province, year) {
    return await this.processor.processPaper(province, year);
  }
  // ==================== 出题功能 ====================
  /**
   * 智能出题 - 根据用户输入解析条件并查询题目
   * @param {string} sessionId - 会话ID
   * @param {string} userInput - 用户输入
   * @returns {Promise<object>} 出题结果
   */
  async smartQuestion(sessionId, userInput) {
    const conditions = parseQuestionRequest(userInput);
    const questions = findQuestionsByConditions(conditions);
    if (questions.length === 0) {
      const provinces = getAvailableProvinces();
      if (provinces.length === 0) {
        return {
          error: "\u6682\u65E0\u53EF\u7528\u7684\u9898\u76EE",
          suggestion: '\u8BF7\u5148\u722C\u53D6\u5E76\u5904\u7406\u8BD5\u5377\u6570\u636E\u3002\n\u4F8B\u5982\u8F93\u5165\uFF1A"\u722C\u53D6\u5E7F\u4E1C2024\u5E74\u8BD5\u5377"'
        };
      }
      return {
        error: "\u6CA1\u6709\u627E\u5230\u7B26\u5408\u6761\u4EF6\u7684\u9898\u76EE",
        suggestion: `\u5F53\u524D\u53EF\u7528\u7701\u4EFD: ${provinces.join("\u3001")}
\u8BF7\u5C1D\u8BD5\u5176\u4ED6\u6761\u4EF6\uFF0C\u6216\u8F93\u5165"\u722C\u53D6XX\u7701XXXX\u5E74\u8BD5\u5377"\u83B7\u53D6\u66F4\u591A\u9898\u76EE`
      };
    }
    if (conditions.random || questions.length === 1) {
      const selectedQuestion = conditions.random ? questions[Math.floor(Math.random() * questions.length)] : questions[0];
      return await this.selectQuestion(sessionId, selectedQuestion.id);
    }
    const options = await Promise.all(
      questions.slice(0, 10).map(async (q) => {
        const history = getLatestAnswerRecord(sessionId, q.id);
        return {
          id: q.id,
          province: q.province,
          year: q.year,
          questionNumber: q.questionNumber,
          score: q.score,
          history: history ? {
            score: history.score,
            answeredAt: history.answered_at
          } : null
        };
      })
    );
    return {
      needSelection: true,
      message: `\u627E\u5230 ${questions.length} \u9053\u7B26\u5408\u6761\u4EF6\u7684\u9898\u76EE\uFF0C\u8BF7\u9009\u62E9\uFF1A`,
      options
    };
  }
  /**
   * 选择并返回指定题目
   */
  async selectQuestion(sessionId, questionId) {
    const db2 = getDatabase();
    const stmt = db2.prepare(`
      SELECT q.*, p.province, p.year, p.level
      FROM questions q
      JOIN exam_papers p ON q.paper_id = p.id
      WHERE q.id = ?
    `);
    const question = stmt.get(questionId);
    if (!question) {
      return { error: "\u9898\u76EE\u4E0D\u5B58\u5728" };
    }
    const materials = findMaterialsForQuestion(questionId);
    createSession(sessionId);
    updateSession(sessionId, {
      currentQuestionId: questionId,
      phase: "answering"
    });
    const history = getLatestAnswerRecord(sessionId, questionId);
    return {
      question,
      materials,
      history
    };
  }
  // ==================== 引导教学功能 ====================
  /**
   * 开始答题引导
   */
  async startGuidance(sessionId) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: "\u8BF7\u5148\u83B7\u53D6\u9898\u76EE" };
    }
    const question = await this.getQuestionById(session.current_question_id);
    const result = await this.tutor.startGuidance(question);
    updateSession(sessionId, { phase: "guided" });
    return result;
  }
  /**
   * 分析用户思路
   */
  async analyzeThinking(sessionId, userThought) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: "\u8BF7\u5148\u83B7\u53D6\u9898\u76EE" };
    }
    const question = await this.getQuestionById(session.current_question_id);
    return await this.tutor.analyzeThinking(question, userThought);
  }
  /**
   * 提供提示
   */
  async provideHint(sessionId, currentProgress = "") {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: "\u8BF7\u5148\u83B7\u53D6\u9898\u76EE" };
    }
    const question = await this.getQuestionById(session.current_question_id);
    return await this.tutor.provideHint(question, currentProgress);
  }
  /**
   * 拓展分析
   */
  async expandTopic(sessionId, topic) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: "\u8BF7\u5148\u83B7\u53D6\u9898\u76EE" };
    }
    const question = await this.getQuestionById(session.current_question_id);
    return await this.tutor.expandTopic(question, topic);
  }
  // ==================== 评分功能 ====================
  /**
   * 评分并保存记录
   */
  async scoreAnswer(sessionId, userAnswer) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: "\u8BF7\u5148\u83B7\u53D6\u9898\u76EE" };
    }
    const question = await this.getQuestionById(session.current_question_id);
    const result = await this.scorer.scoreAnswer(sessionId, question, userAnswer);
    updateSession(sessionId, { phase: "reviewed" });
    return result;
  }
  /**
   * 格式化反馈报告
   */
  formatFeedback(result) {
    return this.scorer.formatFeedback(result);
  }
  // ==================== 统计功能 ====================
  /**
   * 获取学习统计
   */
  getStats(sessionId) {
    const answeredIds = sessionId ? getAnsweredQuestionIds(sessionId) : [];
    const paperStats = getPaperStats();
    return {
      answeredCount: answeredIds.length,
      ...paperStats
    };
  }
  /**
   * 获取可用试卷列表
   */
  getAvailablePapers() {
    const provinces = getAvailableProvinces();
    const years = getAvailableYears();
    const stats = getPaperStats();
    return {
      provinces,
      years,
      stats
    };
  }
  // ==================== 交互处理 ====================
  /**
   * Process user input and return response
   */
  async processInput(sessionId, userInput) {
    let session = getSession(sessionId);
    if (!session) {
      createSession(sessionId);
      session = { id: sessionId, phase: "idle" };
    }
    const intent = recognizeIntent(userInput);
    logger.debug("Intent recognized", { intent, sessionId });
    if (/^[1-9]$|^10$/.test(userInput.trim()) && session.phase === "selecting") {
      return await this.handleSelection(sessionId, parseInt(userInput.trim()));
    }
    try {
      switch (intent) {
        case "give_question":
          return await this.handleSmartQuestion(sessionId, userInput);
        case "submit_answer":
          return await this.handleSubmitAnswer(sessionId, userInput);
        case "start_guide":
          return await this.handleStartGuide(sessionId);
        case "analyze_thought":
          return await this.handleAnalyzeThought(sessionId, userInput);
        case "request_hint":
          return await this.handleRequestHint(sessionId);
        case "request_score":
          return "\u8BF7\u76F4\u63A5\u8F93\u5165\u4F60\u7684\u7B54\u6848\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u8BC4\u5206\u3002";
        case "scrape_paper":
          return await this.handleScrapePaper(userInput);
        case "process_paper":
          return await this.handleProcessPaper(userInput);
        case "list_papers":
          return await this.handleListPapers();
        case "help":
          return this.getHelpText();
        case "stats":
          return await this.handleStats(sessionId);
        default:
          return `\u6211\u4E0D\u592A\u7406\u89E3\u4F60\u7684\u610F\u601D\u3002\u8F93\u5165"\u5E2E\u52A9"\u67E5\u770B\u53EF\u7528\u529F\u80FD\u3002

\u4F60\u8BF4\u7684\u662F: "${userInput}"`;
      }
    } catch (error) {
      logger.error("Process input failed", { intent, error: error.message });
      return `\u5904\u7406\u8BF7\u6C42\u65F6\u51FA\u9519: ${error.message}`;
    }
  }
  /**
   * Handle smart question request
   */
  async handleSmartQuestion(sessionId, userInput) {
    const result = await this.smartQuestion(sessionId, userInput);
    if (result.error) {
      let response = `\u274C ${result.error}`;
      if (result.suggestion) {
        response += `

${result.suggestion}`;
      }
      return response;
    }
    if (result.needSelection) {
      updateSession(sessionId, {
        phase: "selecting",
        pendingOptions: result.options
      });
      let response = `${result.message}

`;
      result.options.forEach((opt, idx) => {
        const historyInfo = opt.history ? ` | \u4E0A\u6B21: ${opt.history.score}\u5206` : " | \u672A\u505A\u8FC7";
        response += `${idx + 1}. ${opt.province} ${opt.year}\u5E74 \u7B2C${opt.questionNumber}\u9898${historyInfo}
`;
      });
      response += "\n\u8BF7\u8F93\u5165\u5E8F\u53F7\u9009\u62E9\u9898\u76EE\uFF1A";
      return response;
    }
    return this.formatQuestionResult(result);
  }
  /**
   * Handle selection from options
   */
  async handleSelection(sessionId, selection) {
    const session = getSession(sessionId);
    if (!session?.pendingOptions || selection > session.pendingOptions.length) {
      return "\u65E0\u6548\u7684\u9009\u62E9\uFF0C\u8BF7\u91CD\u65B0\u51FA\u9898\u3002";
    }
    const selected = session.pendingOptions[selection - 1];
    const result = await this.selectQuestion(sessionId, selected.id);
    if (result.error) {
      return result.error;
    }
    return this.formatQuestionResult(result);
  }
  /**
   * Format question result for display
   */
  formatQuestionResult(result) {
    const { question, materials, history } = result;
    let response = `\u{1F4DD} **\u7B2C${question.question_number}\u9898** (${question.province} ${question.year}\u5E74)

`;
    response += `**\u9898\u76EE:**
${question.question_text}

`;
    if (question.requirements) {
      response += `**\u8981\u6C42:**
${question.requirements}

`;
    }
    if (question.score) {
      response += `**\u5206\u503C:** ${question.score}\u5206

`;
    }
    if (history) {
      response += `**\u5386\u53F2\u8BB0\u5F55:** \u4E0A\u6B21\u5F97\u5206 ${history.score}\u5206

`;
    }
    if (materials?.length > 0) {
      response += `**\u6750\u6599:**
`;
      materials.forEach((m) => {
        const preview = m.content.length > 500 ? m.content.substring(0, 500) + "..." : m.content;
        response += `
\u3010\u6750\u6599${m.material_number}\u3011
${preview}
`;
      });
    }
    response += '\n\u{1F4A1} \u8F93\u5165"\u5F00\u59CB"\u83B7\u53D6\u7B54\u9898\u5F15\u5BFC\uFF0C\u6216\u76F4\u63A5\u8F93\u5165\u4F60\u7684\u7B54\u6848\u3002';
    return response;
  }
  /**
   * Handle submit answer
   */
  async handleSubmitAnswer(sessionId, userInput) {
    const answer = userInput.replace(/^(答案[是为]?|我的答案|作答|提交|回答[是为]?)[：:)]?\s*/i, "");
    const result = await this.scoreAnswer(sessionId, answer);
    if (result.error) {
      return result.error;
    }
    return this.formatFeedback(result);
  }
  /**
   * Handle start guide
   */
  async handleStartGuide(sessionId) {
    const result = await this.startGuidance(sessionId);
    if (result.error) {
      return result.error;
    }
    return `\u{1F3AF} **\u7B54\u9898\u5F15\u5BFC**

${result.guidance}`;
  }
  /**
   * Handle analyze thought
   */
  async handleAnalyzeThought(sessionId, userInput) {
    const thought = userInput.replace(/^(我的思路[是为]?|我想|我是这样想)[：:)]?\s*/i, "");
    const result = await this.analyzeThinking(sessionId, thought);
    if (result.error) {
      return result.error;
    }
    return `\u{1F4AD} **\u601D\u8DEF\u5206\u6790**

${result.analysis}`;
  }
  /**
   * Handle request hint
   */
  async handleRequestHint(sessionId) {
    const result = await this.provideHint(sessionId);
    if (result.error) {
      return result.error;
    }
    return `\u{1F4A1} **\u63D0\u793A**

${result.hint}`;
  }
  /**
   * Handle scrape paper
   */
  async handleScrapePaper(userInput) {
    const provinceMatch = userInput.match(/(\w+)省?/);
    const yearMatch = userInput.match(/(\d{4})/);
    if (!provinceMatch || !yearMatch) {
      return '\u8BF7\u6307\u5B9A\u7701\u4EFD\u548C\u5E74\u4EFD\uFF0C\u4F8B\u5982\uFF1A"\u722C\u53D6\u5E7F\u4E1C\u77012024\u5E74\u8BD5\u5377"';
    }
    const province = provinceMatch[1];
    const year = parseInt(yearMatch[1]);
    const result = await this.scrapePaper(province, year);
    if (result.existing) {
      return `\u8BD5\u5377\u5DF2\u5B58\u5728 (ID: ${result.paperId})\u3002\u8F93\u5165"\u5904\u7406${province}\u7701${year}\u5E74\u8BD5\u5377"\u8FDB\u884C\u89E3\u6790\u3002`;
    }
    return `\u2705 \u8BD5\u5377\u722C\u53D6\u5B8C\u6210 (ID: ${result.paperId})

\u8F93\u5165"\u5904\u7406${province}\u7701${year}\u5E74\u8BD5\u5377"\u8FDB\u884C\u89E3\u6790\u3002`;
  }
  /**
   * Handle process paper
   */
  async handleProcessPaper(userInput) {
    const provinceMatch = userInput.match(/(\w+)省?/);
    const yearMatch = userInput.match(/(\d{4})/);
    if (!provinceMatch || !yearMatch) {
      return '\u8BF7\u6307\u5B9A\u7701\u4EFD\u548C\u5E74\u4EFD\uFF0C\u4F8B\u5982\uFF1A"\u5904\u7406\u5E7F\u4E1C\u77012024\u5E74\u8BD5\u5377"';
    }
    const province = provinceMatch[1];
    const year = parseInt(yearMatch[1]);
    const result = await this.processPaper(province, year);
    if (result.alreadyProcessed) {
      return `\u8BD5\u5377\u5DF2\u5904\u7406\u8FC7 (ID: ${result.paperId})`;
    }
    return `\u2705 \u8BD5\u5377\u5904\u7406\u5B8C\u6210

\u9898\u76EE\u6570: ${result.questions.length}
\u6750\u6599\u6570: ${result.materials.length}` + (result.verification?.issues?.length > 0 ? `

\u26A0\uFE0F \u95EE\u9898: ${result.verification.issues.join(", ")}` : "");
  }
  /**
   * Handle list papers
   */
  async handleListPapers() {
    const { provinces, years, stats } = this.getAvailablePapers();
    let response = `\u{1F4DA} **\u53EF\u7528\u8BD5\u5377\u4FE1\u606F**

`;
    response += `\u8BD5\u5377\u603B\u6570: ${stats.totalPapers}
`;
    response += `\u5DF2\u5904\u7406: ${stats.processedPapers}
`;
    response += `\u9898\u76EE\u603B\u6570: ${stats.totalQuestions}

`;
    if (provinces.length > 0) {
      response += `\u53EF\u7528\u7701\u4EFD: ${provinces.join("\u3001")}
`;
    }
    if (years.length > 0) {
      response += `\u53EF\u7528\u5E74\u4EFD: ${years.join("\u3001")}
`;
    }
    return response;
  }
  /**
   * Handle stats
   */
  async handleStats(sessionId) {
    const stats = this.getStats(sessionId);
    return `\u{1F4CA} **\u5B66\u4E60\u7EDF\u8BA1**

\u5DF2\u7B54\u9898\u6570: ${stats.answeredCount}
\u8BD5\u5377\u603B\u6570: ${stats.totalPapers}
\u9898\u76EE\u603B\u6570: ${stats.totalQuestions}`;
  }
  /**
   * Get question by ID
   */
  async getQuestionById(questionId) {
    const db2 = getDatabase();
    const stmt = db2.prepare(`
      SELECT q.*, p.province, p.year, p.level
      FROM questions q
      JOIN exam_papers p ON q.paper_id = p.id
      WHERE q.id = ?
    `);
    return stmt.get(questionId);
  }
  /**
   * Get help text
   */
  getHelpText() {
    return `\u{1F4DA} **\u7533\u8BBA\u6559\u5B66\u52A9\u624B - \u5E2E\u52A9**

**\u51FA\u9898\u529F\u80FD:**
\u2022 "\u968F\u673A\u7ED9\u6211\u4E00\u9053\u9898" - \u968F\u673A\u51FA\u9898
\u2022 "\u7ED9\u6211\u4E00\u9053\u5E7F\u4E1C\u7684\u7B2C\u4E00\u9898" - \u6307\u5B9A\u7701\u4EFD\u548C\u9898\u53F7
\u2022 "\u7ED9\u6211\u4E00\u90532024\u5E74\u7684\u9898" - \u6307\u5B9A\u5E74\u4EFD

**\u7EC3\u4E60\u529F\u80FD:**
\u2022 "\u5F00\u59CB" - \u83B7\u53D6\u7B54\u9898\u5F15\u5BFC
\u2022 "\u6211\u7684\u601D\u8DEF\u662F..." - \u63D0\u4EA4\u601D\u8DEF\u83B7\u53D6\u5206\u6790
\u2022 "\u63D0\u793A" - \u83B7\u53D6\u63D0\u793A
\u2022 "\u7B54\u6848\u662F..." - \u63D0\u4EA4\u7B54\u6848\u83B7\u53D6\u8BC4\u5206

**\u6570\u636E\u7BA1\u7406:**
\u2022 "\u722C\u53D6XX\u7701XXXX\u5E74\u8BD5\u5377" - \u4E0B\u8F7D\u8BD5\u5377
\u2022 "\u5904\u7406XX\u7701XXXX\u5E74\u8BD5\u5377" - \u89E3\u6790\u8BD5\u5377
\u2022 "\u6709\u54EA\u4E9B\u8BD5\u5377" - \u67E5\u770B\u53EF\u7528\u8BD5\u5377

**\u5176\u4ED6:**
\u2022 "\u7EDF\u8BA1" - \u67E5\u770B\u5B66\u4E60\u8FDB\u5EA6
\u2022 "\u5E2E\u52A9" - \u663E\u793A\u6B64\u5E2E\u52A9`;
  }
  /**
   * Cleanup
   */
  cleanup() {
    closeDatabase();
    logger.info("Skill cleanup completed");
  }
};
function printCliHelp() {
  console.log(`
\u7533\u8BBA\u6559\u5B66\u52A9\u624B CLI

\u7528\u6CD5: node scripts/shenlun.js <command> [options]

\u547D\u4EE4:
  interactive, i         \u4EA4\u4E92\u6A21\u5F0F (\u9ED8\u8BA4)
  question <\u6761\u4EF6>        \u667A\u80FD\u51FA\u9898
                         \u6761\u4EF6\u793A\u4F8B: "\u5E7F\u4E1C\u7B2C\u4E00\u9898" "2024\u5E74" "\u968F\u673A"
  guide                  \u83B7\u53D6\u7B54\u9898\u5F15\u5BFC
  hint                   \u83B7\u53D6\u63D0\u793A
  score <\u7B54\u6848>           \u8BC4\u5206\u7B54\u6848
  stats                  \u67E5\u770B\u5B66\u4E60\u7EDF\u8BA1
  scrape <\u7701> <\u5E74>       \u722C\u53D6\u8BD5\u5377
  process <\u7701> <\u5E74>      \u5904\u7406\u8BD5\u5377
  list                   \u67E5\u770B\u53EF\u7528\u8BD5\u5377
  help, -h               \u663E\u793A\u5E2E\u52A9

\u793A\u4F8B:
  node scripts/shenlun.js                        # \u4EA4\u4E92\u6A21\u5F0F
  node scripts/shenlun.js question "\u5E7F\u4E1C\u7B2C\u4E00\u9898"  # \u6307\u5B9A\u6761\u4EF6\u51FA\u9898
  node scripts/shenlun.js question "\u968F\u673A"        # \u968F\u673A\u51FA\u9898
  node scripts/shenlun.js guide                  # \u83B7\u53D6\u5F15\u5BFC
  node scripts/shenlun.js hint                   # \u83B7\u53D6\u63D0\u793A
  node scripts/shenlun.js score "\u6211\u7684\u7B54\u6848"       # \u8BC4\u5206
  node scripts/shenlun.js stats                  # \u67E5\u770B\u7EDF\u8BA1
  node scripts/shenlun.js scrape \u5E7F\u4E1C 2024      # \u722C\u53D6\u8BD5\u5377
  node scripts/shenlun.js process \u5E7F\u4E1C 2024      # \u5904\u7406\u8BD5\u5377
  node scripts/shenlun.js list                   # \u67E5\u770B\u53EF\u7528\u8BD5\u5377
`);
}
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === "help" || command === "-h" || command === "--help") {
    printCliHelp();
    process.exit(0);
  }
  const skill = new ShenLunTeacherSkill();
  const sessionId = randomUUID();
  try {
    await skill.initialize();
    switch (command) {
      case "scrape": {
        const province = args[1];
        const year = parseInt(args[2]);
        if (!province || !year) {
          console.error("\u9519\u8BEF: \u9700\u8981\u6307\u5B9A\u7701\u4EFD\u548C\u5E74\u4EFD");
          console.error("\u7528\u6CD5: node src/index.js scrape <\u7701\u4EFD> <\u5E74\u4EFD>");
          process.exit(1);
        }
        const result = await skill.scrapePaper(province, year);
        if (result.existing) {
          console.log(`\u8BD5\u5377\u5DF2\u5B58\u5728 (ID: ${result.paperId})`);
        } else {
          console.log(`\u2705 \u8BD5\u5377\u722C\u53D6\u5B8C\u6210 (ID: ${result.paperId})`);
        }
        break;
      }
      case "process": {
        const province = args[1];
        const year = parseInt(args[2]);
        if (!province || !year) {
          console.error("\u9519\u8BEF: \u9700\u8981\u6307\u5B9A\u7701\u4EFD\u548C\u5E74\u4EFD");
          console.error("\u7528\u6CD5: node src/index.js process <\u7701\u4EFD> <\u5E74\u4EFD>");
          process.exit(1);
        }
        const result = await skill.processPaper(province, year);
        if (result.alreadyProcessed) {
          console.log(`\u8BD5\u5377\u5DF2\u5904\u7406\u8FC7 (ID: ${result.paperId})`);
        } else {
          console.log(`\u2705 \u8BD5\u5377\u5904\u7406\u5B8C\u6210`);
          console.log(`\u9898\u76EE\u6570: ${result.questions.length}`);
          console.log(`\u6750\u6599\u6570: ${result.materials.length}`);
        }
        break;
      }
      case "question":
      case "q": {
        const condition = args.slice(1).join(" ") || "\u968F\u673A";
        const result = await skill.smartQuestion(sessionId, condition);
        if (result.error) {
          console.log(`
\u274C ${result.error}`);
          if (result.suggestion) {
            console.log(`
${result.suggestion}`);
          }
          break;
        }
        if (result.needSelection) {
          console.log(`
${result.message}
`);
          result.options.forEach((opt, idx) => {
            const historyInfo = opt.history ? ` | \u4E0A\u6B21: ${opt.history.score}\u5206` : " | \u672A\u505A\u8FC7";
            console.log(`${idx + 1}. ${opt.province} ${opt.year}\u5E74 \u7B2C${opt.questionNumber}\u9898${historyInfo}`);
          });
          console.log("\n\u8BF7\u4F7F\u7528 select \u547D\u4EE4\u9009\u62E9\uFF0C\u4F8B\u5982: node src/index.js select 1");
          break;
        }
        console.log(skill.formatQuestionResult(result));
        break;
      }
      case "select": {
        const selection = parseInt(args[1]);
        if (!selection) {
          console.error("\u9519\u8BEF: \u9700\u8981\u6307\u5B9A\u9009\u9879\u5E8F\u53F7");
          console.error("\u7528\u6CD5: node src/index.js select <\u5E8F\u53F7>");
          process.exit(1);
        }
        console.log("\u63D0\u793A: \u9009\u62E9\u529F\u80FD\u9700\u8981\u5728\u4EA4\u4E92\u6A21\u5F0F\u4E0B\u4F7F\u7528");
        console.log("\u8BF7\u8FD0\u884C: node src/index.js");
        break;
      }
      case "guide": {
        const result = await skill.startGuidance(sessionId);
        if (result.error) {
          console.log(result.error);
          console.log('\u8BF7\u5148\u83B7\u53D6\u9898\u76EE: node src/index.js question "\u6761\u4EF6"');
        } else {
          console.log(`
\u{1F3AF} \u7B54\u9898\u5F15\u5BFC

${result.guidance}
`);
        }
        break;
      }
      case "hint": {
        const result = await skill.provideHint(sessionId);
        if (result.error) {
          console.log(result.error);
          console.log('\u8BF7\u5148\u83B7\u53D6\u9898\u76EE: node src/index.js question "\u6761\u4EF6"');
        } else {
          console.log(`
\u{1F4A1} \u63D0\u793A

${result.hint}
`);
        }
        break;
      }
      case "score": {
        const answer = args.slice(1).join(" ");
        if (!answer) {
          console.error("\u9519\u8BEF: \u9700\u8981\u63D0\u4F9B\u7B54\u6848");
          console.error('\u7528\u6CD5: node src/index.js score "\u4F60\u7684\u7B54\u6848"');
          process.exit(1);
        }
        const result = await skill.scoreAnswer(sessionId, answer);
        if (result.error) {
          console.log(result.error);
          console.log('\u8BF7\u5148\u83B7\u53D6\u9898\u76EE: node src/index.js question "\u6761\u4EF6"');
        } else {
          console.log(skill.formatFeedback(result));
        }
        break;
      }
      case "stats": {
        const stats = skill.getStats(sessionId);
        console.log(`
\u{1F4CA} \u5B66\u4E60\u7EDF\u8BA1
`);
        console.log(`\u5DF2\u7B54\u9898\u6570: ${stats.answeredCount}`);
        console.log(`\u8BD5\u5377\u603B\u6570: ${stats.totalPapers}`);
        console.log(`\u9898\u76EE\u603B\u6570: ${stats.totalQuestions}
`);
        break;
      }
      case "list": {
        const { provinces, years, stats } = skill.getAvailablePapers();
        console.log(`
\u{1F4DA} \u53EF\u7528\u8BD5\u5377\u4FE1\u606F
`);
        console.log(`\u8BD5\u5377\u603B\u6570: ${stats.totalPapers}`);
        console.log(`\u5DF2\u5904\u7406: ${stats.processedPapers}`);
        console.log(`\u9898\u76EE\u603B\u6570: ${stats.totalQuestions}
`);
        if (provinces.length > 0) {
          console.log(`\u53EF\u7528\u7701\u4EFD: ${provinces.join("\u3001")}`);
        }
        if (years.length > 0) {
          console.log(`\u53EF\u7528\u5E74\u4EFD: ${years.join("\u3001")}`);
        }
        console.log();
        break;
      }
      case "interactive":
      case "i":
      case void 0: {
        console.log('\u7533\u8BBA\u6559\u5B66\u52A9\u624B\u5DF2\u542F\u52A8\u3002\u8F93\u5165"\u5E2E\u52A9"\u67E5\u770B\u529F\u80FD\u3002');
        console.log("\u6309 Ctrl+C \u9000\u51FA\u3002\n");
        const readline = (await import("readline")).createInterface({
          input: process.stdin,
          output: process.stdout
        });
        const prompt = () => {
          readline.question("\u4F60: ", async (input) => {
            if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
              readline.close();
              skill.cleanup();
              return;
            }
            try {
              const response = await skill.processInput(sessionId, input);
              console.log(`
\u8001\u5E08: ${response}
`);
            } catch (error) {
              console.error(`\u9519\u8BEF: ${error.message}`);
            }
            prompt();
          });
        };
        prompt();
        return;
      }
      default:
        console.error(`\u672A\u77E5\u547D\u4EE4: ${command}`);
        printCliHelp();
        process.exit(1);
    }
    skill.cleanup();
  } catch (error) {
    console.error("\u9519\u8BEF:", error.message);
    skill.cleanup();
    process.exit(1);
  }
}
var src_default = ShenLunTeacherSkill;
var entryFile = process.argv[1]?.split("/").pop()?.split("\\").pop();
if (entryFile === "index.js" || entryFile === "shenlun.js") {
  main();
}
export {
  ShenLunTeacherSkill,
  src_default as default
};
