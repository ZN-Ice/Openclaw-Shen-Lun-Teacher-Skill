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

| 方法 | 说明 | 参数 |
|------|------|------|
| `scrapePaper(province, year)` | 爬取指定省份和年份的试卷 | province: 省份, year: 年份 |
| `processPaper(province, year)` | 解析试卷，拆分题目和材料 | province: 省份, year: 年份 |
| `getAvailablePapers()` | 获取可用试卷列表 | 无 |

### 2. 智能出题

| 方法 | 说明 | 参数 |
|------|------|------|
| `smartQuestion(sessionId, userInput)` | 智能出题，解析自然语言条件 | sessionId: 会话ID, userInput: 用户输入 |
| `selectQuestion(sessionId, questionId)` | 选择并返回指定题目 | sessionId: 会话ID, questionId: 题目ID |

**支持的出题条件：**
- 随机出题: "随机"、"随便来一题"
- 指定省份: "广东第一题"、"给我一道江苏的题"
- 指定年份: "2024年的题"
- 指定题号: "第一题"、"第2题"
- 组合条件: "随机给我一道2024年广东的第一题"

**返回结果：**
- 如果找到唯一匹配或随机选择：直接返回题目
- 如果找到多个匹配：返回选项列表（含历史记录），等待用户选择

### 3. 引导教学

| 方法 | 说明 | 参数 |
|------|------|------|
| `startGuidance(sessionId)` | 开始答题引导 | sessionId: 会话ID |
| `analyzeThinking(sessionId, userThought)` | 分析用户思路 | sessionId: 会话ID, userThought: 用户思路 |
| `provideHint(sessionId, currentProgress)` | 提供提示 | sessionId: 会话ID, currentProgress: 当前进度 |
| `expandTopic(sessionId, topic)` | 拓展分析 | sessionId: 会话ID, topic: 拓展主题 |

### 4. 评分功能

| 方法 | 说明 | 参数 |
|------|------|------|
| `scoreAnswer(sessionId, userAnswer)` | 评分并保存记录 | sessionId: 会话ID, userAnswer: 用户答案 |
| `formatFeedback(result)` | 格式化反馈报告 | result: 评分结果 |

### 5. 统计功能

| 方法 | 说明 | 参数 |
|------|------|------|
| `getStats(sessionId)` | 获取学习统计 | sessionId: 会话ID |

## 使用示例

### API 调用

```javascript
import { ShenLunTeacherSkill } from './src/index.js';

const skill = new ShenLunTeacherSkill();
await skill.initialize();

// 智能出题
const result = await skill.smartQuestion('session-123', '给我一道广东的第一题');

if (result.needSelection) {
  // 多个选项
  console.log('请选择:', result.options);
} else if (result.question) {
  // 题目信息
  console.log('题目:', result.question.question_text);
  console.log('材料:', result.materials);
  console.log('历史:', result.history);
}

// 获取引导
const guide = await skill.startGuidance('session-123');
console.log(guide.guidance);

// 评分
const score = await skill.scoreAnswer('session-123', '我的答案...');
console.log(skill.formatFeedback(score));
```

### 交互模式

```javascript
const skill = new ShenLunTeacherSkill();
await skill.initialize();

// 处理用户输入（支持自然语言意图识别）
const response = await skill.processInput('session-123', '随机给我一道广东的第一题');
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
# 交互模式
npm start

# 智能出题
node src/index.js question "广东第一题"
node src/index.js question "随机"

# 获取引导/提示
node src/index.js guide
node src/index.js hint

# 评分
node src/index.js score "我的答案"

# 统计/列表
node src/index.js stats
node src/index.js list

# 爬取/处理试卷
node src/index.js scrape 广东 2024
node src/index.js process 广东 2024
```

## 数据库结构

| 表名 | 说明 |
|------|------|
| `exam_papers` | 试卷表 |
| `questions` | 题目表 |
| `materials` | 材料表 |
| `problem_docs` | 题目材料关联表 |
| `user_sessions` | 用户会话表 |
| `answer_records` | 答题记录表 |

## 模块说明

| 模块 | 文件 | 功能 |
|------|------|------|
| LLM客户端 | `src/llm/client.js` | GLM API调用封装 |
| 数据库 | `src/db/index.js` | SQLite操作封装 |
| 爬虫 | `src/modules/scraper.js` | 试卷下载 |
| 处理器 | `src/modules/processor.js` | 内容拆分 |
| 教学 | `src/modules/tutor.js` | 引导学习 |
| 评分 | `src/modules/scorer.js` | 答案评分 |

## 评分维度

- **内容完整性** (0-100): 是否覆盖所有要点
- **逻辑结构** (0-100): 结构是否清晰合理
- **语言表达** (0-100): 语言是否规范流畅
- **观点深度** (0-100): 分析是否深入到位
