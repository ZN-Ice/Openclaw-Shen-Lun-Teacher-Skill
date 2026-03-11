# OpenClaw 申论教学 Skill

基于 GLM 大模型的申论学习助手，提供智能出题、引导式学习和自动评分功能。

## 特性

- **智能出题**: 随机抽取题目，支持按省份、年份筛选
- **引导学习**: 循序渐进的思考引导，而非直接给答案
- **自动评分**: 多维度评分（内容/结构/语言/深度）
- **数据持久化**: SQLite 存储题目、材料和答题记录
- **LLM 集成**: 支持 GLM 系列大模型

## 快速开始

### 1. 安装依赖

```bash
cd Openclaw-Shen-Lun-Teacher-Skill
npm install
```

### 2. 配置环境

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 GLM API Key
```

### 3. 运行

```bash
# 交互模式
npm start

# 或使用 CLI 命令
node src/index.js scrape 广东 2024  # 爬取试卷
node src/index.js process 广东 2024  # 处理试卷
```

## 项目结构

```
Openclaw-Shen-Lun-Teacher-Skill/
├── SKILL.md                    # Skill 定义文件
├── README.md                   # 本文件
├── package.json
├── .env.example
├── src/
│   ├── index.js               # 主入口
│   ├── config.js              # 配置加载
│   ├── llm/
│   │   └── client.js          # LLM 客户端
│   ├── db/
│   │   ├── index.js           # 数据库操作
│   │   └── schema.sql         # 表结构
│   ├── modules/
│   │   ├── scraper.js         # 爬虫模块
│   │   ├── processor.js       # 处理器模块
│   │   ├── question-bank.js   # 题库模块
│   │   ├── tutor.js           # 教学模块
│   │   └── scorer.js          # 评分模块
│   └── utils/
│       ├── logger.js          # 日志工具
│       └── http-client.js     # HTTP 客户端
└── data/                       # 数据目录
    └── shenlun.db             # SQLite 数据库
```

## API 使用

```javascript
import { ShenLunTeacherSkill } from './src/index.js';

const skill = new ShenLunTeacherSkill();
await skill.initialize();

// 处理用户输入（支持自然语言意图识别）
const response = await skill.processInput('session-123', '出题');
console.log(response);
```

### 支持的意图

| 意图 | 示例输入 |
|------|----------|
| 出题 | "出题"、"来一题"、"下一题" |
| 提交答案 | "答案是..."、"我的答案..." |
| 获取引导 | "开始"、"怎么答"、"提示" |
| 思路分析 | "我的思路是..."、"我想..." |
| 评分 | "评分"、"打分" |
| 爬取试卷 | "爬取广东省2024年试卷" |
| 处理试卷 | "处理广东省2024年试卷" |
| 查看统计 | "统计"、"进度" |
| 帮助 | "帮助"、"help" |

## 评分维度

- **内容完整性** (0-100): 是否覆盖所有要点
- **逻辑结构** (0-100): 结构是否清晰合理
- **语言表达** (0-100): 语言是否规范流畅
- **观点深度** (0-100): 分析是否深入到位

## 依赖

- `better-sqlite3` - SQLite 数据库
- `dotenv` - 环境变量管理
- `jsdom` - HTML 解析

## License

MIT
