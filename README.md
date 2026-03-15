# OpenClaw 申论教学 Skill

基于 GLM 大模型的申论学习助手，提供智能出题、引导式学习和自动评分功能。

## 特性

- **智能出题**: 解析自然语言条件，支持省份、年份、题号筛选，显示历史记录
- **引导学习**: 循序渐进的思考引导，而非直接给答案
- **自动评分**: 多维度评分（内容/结构/语言/深度）
- **数据持久化**: SQLite 存储题目、材料和答题记录
- **LLM 集成**: 支持 GLM 系列大模型

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 GLM API Key
```

### 3. 构建与运行

```bash
# 构建打包（生成 scripts/shenlun.js）
npm run build

# 交互模式
npm start
# 或
node scripts/shenlun.js

# 开发模式（直接运行源码）
npm run dev

# CLI 命令
node scripts/shenlun.js question "广东第一题"  # 智能出题
node scripts/shenlun.js score "我的答案"        # 评分
```

## CLI 命令

### 基本命令

```bash
node scripts/shenlun.js <command> [options]
```

| 命令 | 简写 | 说明 |
|------|------|------|
| `interactive` | `i` | 交互模式 (默认) |
| `question <条件>` | `q` | 智能出题，支持自然语言条件 |
| `guide` | - | 获取答题引导 |
| `hint` | - | 获取提示 |
| `score <答案>` | - | 评分答案 |
| `stats` | - | 查看学习统计 |
| `list` | - | 查看可用试卷 |
| `scrape <省> <年>` | - | 爬取试卷 |
| `process <省> <年>` | - | 处理试卷 |
| `help` | `-h` | 显示帮助 |

### 智能出题

出题功能支持自然语言条件解析：

```bash
# 随机出题
node scripts/shenlun.js question "随机"
node scripts/shenlun.js question "随便来一题"

# 指定省份
node scripts/shenlun.js question "广东第一题"
node scripts/shenlun.js question "给我一道江苏的题"

# 指定年份
node scripts/shenlun.js question "2024年的题"
node scripts/shenlun.js question "广东2023年第二题"

# 组合条件
node scripts/shenlun.js question "随机给我一道2024年广东的第一题"
```

### 使用示例

```bash
# 交互模式
npm start

# 智能出题
npm run question -- "广东第一题"
node scripts/shenlun.js question "随机"

# 获取引导
npm run guide
node scripts/shenlun.js guide

# 获取提示
npm run hint
node scripts/shenlun.js hint

# 评分答案
npm run score -- "我认为应该从公共交通入手解决这个问题"
node scripts/shenlun.js score "我的答案是..."

# 查看统计
npm run stats
node scripts/shenlun.js stats

# 查看可用试卷
npm run list
node scripts/shenlun.js list

# 数据管理
npm run scrape -- 广东 2024
node scripts/shenlun.js scrape 广东 2024

npm run process -- 广东 2024
node scripts/shenlun.js process 广东 2024
```

### NPM Scripts

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建打包到 scripts/shenlun.js |
| `npm start` | 启动交互模式 |
| `npm run dev` | 开发模式（直接运行源码） |
| `npm run question -- "条件"` | 智能出题 |
| `npm run guide` | 获取引导 |
| `npm run hint` | 获取提示 |
| `npm run score -- "答案"` | 评分答案 |
| `npm run stats` | 查看统计 |
| `npm run list` | 查看可用试卷 |
| `npm run scrape -- <省> <年>` | 爬取试卷 |
| `npm run process -- <省> <年>` | 处理试卷 |

## 项目结构

```
Openclaw-Shen-Lun-Teacher-Skill/
├── SKILL.md                    # Skill 定义文件
├── README.md                   # 本文件
├── package.json
├── .env.example
├── scripts/
│   └── shenlun.js             # 打包后的可执行脚本
├── src/
│   ├── index.js               # 主入口 (CLI + 交互 + API)
│   ├── config.js              # 配置加载
│   ├── llm/
│   │   └── client.js          # LLM 客户端
│   ├── db/
│   │   ├── index.js           # 数据库操作
│   │   └── schema.sql         # 表结构
│   ├── modules/
│   │   ├── scraper.js         # 爬虫模块
│   │   ├── processor.js       # 处理器模块
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

// 智能出题（解析自然语言条件）
const result = await skill.smartQuestion('session-123', '给我一道广东的第一题');

if (result.needSelection) {
  // 多个选项，让用户选择
  console.log(result.options);
} else if (result.question) {
  // 直接返回题目
  console.log(result.question);
}

// 获取引导
const guide = await skill.startGuidance('session-123');

// 评分答案
const score = await skill.scoreAnswer('session-123', '我的答案...');
console.log(skill.formatFeedback(score));
```

### 支持的意图

| 意图 | 示例输入 |
|------|----------|
| 智能出题 | "随机给我一道题"、"广东第一题"、"2024年的题" |
| 提交答案 | "答案是..."、"我的答案..." |
| 获取引导 | "开始"、"怎么答"、"引导" |
| 思路分析 | "我的思路是..."、"我想..." |
| 获取提示 | "提示"、"点拨" |
| 爬取试卷 | "爬取广东省2024年试卷" |
| 处理试卷 | "处理广东省2024年试卷" |
| 查看统计 | "统计"、"进度" |
| 查看试卷 | "有哪些试卷"、"试卷列表" |
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
