-- 试卷表
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
