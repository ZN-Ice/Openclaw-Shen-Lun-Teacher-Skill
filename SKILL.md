# 申论教学 Skill

基于GLM大模型的申论学习助手，提供试卷爬取、智能出题、引导式学习和自动评分功能。

## 触发条件

当用户询问以下内容时自动激活：
- 申论学习、练习、备考
- 公务员考试申论部分
- 申论题目、材料分析
- 申论答题技巧、评分

## 功能列表

### 1. 数据管理
- `scrapePaper(province, year)` - 爬取指定省份和年份的试卷
- `processPaper(province, year)` - 解析试卷，拆分题目和材料

### 2. 练习功能
- `getRandomQuestion(sessionId, options)` - 获取随机题目
- `startGuidance(question)` - 开始答题引导
- `analyzeThinking(question, userThought)` - 分析用户思路
- `provideHint(question, currentProgress)` - 提供提示
- `expandTopic(question, topic)` - 拓展分析

### 3. 评分功能
- `scoreAnswer(sessionId, question, userAnswer)` - 评分并保存记录
- `formatFeedback(result)` - 格式化反馈报告

## 使用示例

```javascript
import { ShenLunTeacherSkill } from './src/index.js';

const skill = new ShenLunTeacherSkill();
await skill.initialize();

// 处理用户输入
const response = await skill.processInput('session-123', '出题');
console.log(response);
```

## 环境配置

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置
LLM_API_KEY=your_glm_api_key
LLM_MODEL=glm-4-flash
```

## CLI 命令

```bash
# 爬取试卷
npm run scrape -- 广东 2024

# 处理试卷
npm run process -- 广东 2024

# 交互模式
npm start
```

## 数据库结构

- `exam_papers` - 试卷表
- `questions` - 题目表
- `materials` - 材料表
- `problem_docs` - 题目材料关联表
- `user_sessions` - 用户会话表
- `answer_records` - 答题记录表

## 模块说明

| 模块 | 文件 | 功能 |
|------|------|------|
| LLM客户端 | `src/llm/client.js` | GLM API调用封装 |
| 数据库 | `src/db/index.js` | SQLite操作封装 |
| 爬虫 | `src/modules/scraper.js` | 试卷下载 |
| 处理器 | `src/modules/processor.js` | 内容拆分 |
| 题库 | `src/modules/question-bank.js` | 题目查询 |
| 教学 | `src/modules/tutor.js` | 引导学习 |
| 评分 | `src/modules/scorer.js` | 答案评分 |
