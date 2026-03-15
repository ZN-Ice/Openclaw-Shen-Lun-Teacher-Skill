import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { CONFIG, validateConfig } from './config.js';
import { logger } from './utils/logger.js';
import {
  initDatabase,
  closeDatabase,
  createSession,
  getSession,
  updateSession,
  getDatabase,
  findQuestionsByConditions,
  findMaterialsForQuestion,
  getLatestAnswerRecord,
  getAnsweredQuestionIds,
  getAvailableProvinces,
  getAvailableYears,
  getPaperStats,
} from './db/index.js';
import { getScraper } from './modules/scraper.js';
import { getProcessor } from './modules/processor.js';
import { getTutor } from './modules/tutor.js';
import { getScorer } from './modules/scorer.js';

// Load environment
config();

/**
 * 解析用户出题请求，提取条件
 * @param {string} input - 用户输入，如"随机给我一道广东的第一题"
 * @returns {object} 解析结果 { province, year, questionNumber, random }
 */
function parseQuestionRequest(input) {
  const result = {
    province: null,
    year: null,
    questionNumber: null,
    random: false,
  };

  // 检测随机请求
  if (/随机|随便|任意/.test(input)) {
    result.random = true;
  }

  // 提取省份（支持"广东"、"广东省"、"广东省考"等）
  const provinceMatch = input.match(/(\w+)(?:省|省考)?/);
  if (provinceMatch && provinceMatch[1] && !['随机', '随便', '任意', '一道', '给我'].includes(provinceMatch[1])) {
    result.province = provinceMatch[1];
  }

  // 提取年份
  const yearMatch = input.match(/(\d{4})/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1]);
  }

  // 提取题号（支持"第一题"、"第1题"、"题号1"等）
  const numberMatch = input.match(/第?(\d+|[一二三四五])[题]?/);
  if (numberMatch) {
    const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5 };
    result.questionNumber = numMap[numberMatch[1]] || parseInt(numberMatch[1]);
  }

  // 检测国考
  if (/国考/.test(input)) {
    result.level = '国考';
  }

  return result;
}

/**
 * Intent patterns for user input recognition
 */
const INTENT_PATTERNS = {
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
  list_papers: [/有哪些.*试卷/, /可用.*试卷/, /试卷列表/],
};

/**
 * Recognize user intent from input
 */
function recognizeIntent(input) {
  const normalizedInput = input.toLowerCase().trim();

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedInput)) {
        return intent;
      }
    }
  }

  return 'unknown';
}

/**
 * Main Skill class
 */
export class ShenLunTeacherSkill {
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
      logger.info('ShenLun Teacher Skill initialized');
      return true;
    } catch (error) {
      logger.error('Initialization failed', { error: error.message });
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
    // 解析用户请求
    const conditions = parseQuestionRequest(userInput);

    // 查询符合条件的题目
    const questions = findQuestionsByConditions(conditions);

    if (questions.length === 0) {
      // 没有找到题目，检查是否有可用试卷
      const provinces = getAvailableProvinces();
      if (provinces.length === 0) {
        return {
          error: '暂无可用的题目',
          suggestion: '请先爬取并处理试卷数据。\n例如输入："爬取广东2024年试卷"',
        };
      }

      return {
        error: '没有找到符合条件的题目',
        suggestion: `当前可用省份: ${provinces.join('、')}\n请尝试其他条件，或输入"爬取XX省XXXX年试卷"获取更多题目`,
      };
    }

    // 如果是随机请求或只有一个结果，直接返回
    if (conditions.random || questions.length === 1) {
      const selectedQuestion = conditions.random
        ? questions[Math.floor(Math.random() * questions.length)]
        : questions[0];

      return await this.selectQuestion(sessionId, selectedQuestion.id);
    }

    // 多个结果，返回选项供用户选择（包含历史记录）
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
            answeredAt: history.answered_at,
          } : null,
        };
      })
    );

    return {
      needSelection: true,
      message: `找到 ${questions.length} 道符合条件的题目，请选择：`,
      options,
    };
  }

  /**
   * 选择并返回指定题目
   */
  async selectQuestion(sessionId, questionId) {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT q.*, p.province, p.year, p.level
      FROM questions q
      JOIN exam_papers p ON q.paper_id = p.id
      WHERE q.id = ?
    `);
    const question = stmt.get(questionId);

    if (!question) {
      return { error: '题目不存在' };
    }

    // 获取材料
    const materials = findMaterialsForQuestion(questionId);

    // 更新会话
    createSession(sessionId);
    updateSession(sessionId, {
      currentQuestionId: questionId,
      phase: 'answering',
    });

    // 获取历史记录
    const history = getLatestAnswerRecord(sessionId, questionId);

    return {
      question,
      materials,
      history,
    };
  }

  // ==================== 引导教学功能 ====================

  /**
   * 开始答题引导
   */
  async startGuidance(sessionId) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: '请先获取题目' };
    }

    const question = await this.getQuestionById(session.current_question_id);
    const result = await this.tutor.startGuidance(question);

    updateSession(sessionId, { phase: 'guided' });

    return result;
  }

  /**
   * 分析用户思路
   */
  async analyzeThinking(sessionId, userThought) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: '请先获取题目' };
    }

    const question = await this.getQuestionById(session.current_question_id);
    return await this.tutor.analyzeThinking(question, userThought);
  }

  /**
   * 提供提示
   */
  async provideHint(sessionId, currentProgress = '') {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return { error: '请先获取题目' };
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
      return { error: '请先获取题目' };
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
      return { error: '请先获取题目' };
    }

    const question = await this.getQuestionById(session.current_question_id);
    const result = await this.scorer.scoreAnswer(sessionId, question, userAnswer);

    updateSession(sessionId, { phase: 'reviewed' });

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
      ...paperStats,
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
      stats,
    };
  }

  // ==================== 交互处理 ====================

  /**
   * Process user input and return response
   */
  async processInput(sessionId, userInput) {
    // Ensure session exists
    let session = getSession(sessionId);
    if (!session) {
      createSession(sessionId);
      session = { id: sessionId, phase: 'idle' };
    }

    const intent = recognizeIntent(userInput);
    logger.debug('Intent recognized', { intent, sessionId });

    // 检查是否是选择题目的回复
    if (/^[1-9]$|^10$/.test(userInput.trim()) && session.phase === 'selecting') {
      return await this.handleSelection(sessionId, parseInt(userInput.trim()));
    }

    try {
      switch (intent) {
        case 'give_question':
          return await this.handleSmartQuestion(sessionId, userInput);

        case 'submit_answer':
          return await this.handleSubmitAnswer(sessionId, userInput);

        case 'start_guide':
          return await this.handleStartGuide(sessionId);

        case 'analyze_thought':
          return await this.handleAnalyzeThought(sessionId, userInput);

        case 'request_hint':
          return await this.handleRequestHint(sessionId);

        case 'request_score':
          return '请直接输入你的答案，系统会自动评分。';

        case 'scrape_paper':
          return await this.handleScrapePaper(userInput);

        case 'process_paper':
          return await this.handleProcessPaper(userInput);

        case 'list_papers':
          return await this.handleListPapers();

        case 'help':
          return this.getHelpText();

        case 'stats':
          return await this.handleStats(sessionId);

        default:
          return `我不太理解你的意思。输入"帮助"查看可用功能。\n\n你说的是: "${userInput}"`;
      }
    } catch (error) {
      logger.error('Process input failed', { intent, error: error.message });
      return `处理请求时出错: ${error.message}`;
    }
  }

  /**
   * Handle smart question request
   */
  async handleSmartQuestion(sessionId, userInput) {
    const result = await this.smartQuestion(sessionId, userInput);

    if (result.error) {
      let response = `❌ ${result.error}`;
      if (result.suggestion) {
        response += `\n\n${result.suggestion}`;
      }
      return response;
    }

    if (result.needSelection) {
      // 保存选项到会话
      updateSession(sessionId, {
        phase: 'selecting',
        pendingOptions: result.options,
      });

      let response = `${result.message}\n\n`;
      result.options.forEach((opt, idx) => {
        const historyInfo = opt.history
          ? ` | 上次: ${opt.history.score}分`
          : ' | 未做过';
        response += `${idx + 1}. ${opt.province} ${opt.year}年 第${opt.questionNumber}题${historyInfo}\n`;
      });
      response += '\n请输入序号选择题目：';
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
      return '无效的选择，请重新出题。';
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

    let response = `📝 **第${question.question_number}题** (${question.province} ${question.year}年)\n\n`;
    response += `**题目:**\n${question.question_text}\n\n`;

    if (question.requirements) {
      response += `**要求:**\n${question.requirements}\n\n`;
    }

    if (question.score) {
      response += `**分值:** ${question.score}分\n\n`;
    }

    if (history) {
      response += `**历史记录:** 上次得分 ${history.score}分\n\n`;
    }

    if (materials?.length > 0) {
      response += `**材料:**\n`;
      materials.forEach((m) => {
        const preview = m.content.length > 500 ? m.content.substring(0, 500) + '...' : m.content;
        response += `\n【材料${m.material_number}】\n${preview}\n`;
      });
    }

    response += '\n💡 输入"开始"获取答题引导，或直接输入你的答案。';

    return response;
  }

  /**
   * Handle submit answer
   */
  async handleSubmitAnswer(sessionId, userInput) {
    const answer = userInput.replace(/^(答案[是为]?|我的答案|作答|提交|回答[是为]?)[：:)]?\s*/i, '');
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

    return `🎯 **答题引导**\n\n${result.guidance}`;
  }

  /**
   * Handle analyze thought
   */
  async handleAnalyzeThought(sessionId, userInput) {
    const thought = userInput.replace(/^(我的思路[是为]?|我想|我是这样想)[：:)]?\s*/i, '');
    const result = await this.analyzeThinking(sessionId, thought);

    if (result.error) {
      return result.error;
    }

    return `💭 **思路分析**\n\n${result.analysis}`;
  }

  /**
   * Handle request hint
   */
  async handleRequestHint(sessionId) {
    const result = await this.provideHint(sessionId);

    if (result.error) {
      return result.error;
    }

    return `💡 **提示**\n\n${result.hint}`;
  }

  /**
   * Handle scrape paper
   */
  async handleScrapePaper(userInput) {
    const provinceMatch = userInput.match(/(\w+)省?/);
    const yearMatch = userInput.match(/(\d{4})/);

    if (!provinceMatch || !yearMatch) {
      return '请指定省份和年份，例如："爬取广东省2024年试卷"';
    }

    const province = provinceMatch[1];
    const year = parseInt(yearMatch[1]);

    const result = await this.scrapePaper(province, year);

    if (result.existing) {
      return `试卷已存在 (ID: ${result.paperId})。输入"处理${province}省${year}年试卷"进行解析。`;
    }

    return `✅ 试卷爬取完成 (ID: ${result.paperId})\n\n输入"处理${province}省${year}年试卷"进行解析。`;
  }

  /**
   * Handle process paper
   */
  async handleProcessPaper(userInput) {
    const provinceMatch = userInput.match(/(\w+)省?/);
    const yearMatch = userInput.match(/(\d{4})/);

    if (!provinceMatch || !yearMatch) {
      return '请指定省份和年份，例如："处理广东省2024年试卷"';
    }

    const province = provinceMatch[1];
    const year = parseInt(yearMatch[1]);

    const result = await this.processPaper(province, year);

    if (result.alreadyProcessed) {
      return `试卷已处理过 (ID: ${result.paperId})`;
    }

    return `✅ 试卷处理完成\n\n` +
           `题目数: ${result.questions.length}\n` +
           `材料数: ${result.materials.length}` +
           (result.verification?.issues?.length > 0
             ? `\n\n⚠️ 问题: ${result.verification.issues.join(', ')}`
             : '');
  }

  /**
   * Handle list papers
   */
  async handleListPapers() {
    const { provinces, years, stats } = this.getAvailablePapers();

    let response = `📚 **可用试卷信息**\n\n`;
    response += `试卷总数: ${stats.totalPapers}\n`;
    response += `已处理: ${stats.processedPapers}\n`;
    response += `题目总数: ${stats.totalQuestions}\n\n`;

    if (provinces.length > 0) {
      response += `可用省份: ${provinces.join('、')}\n`;
    }

    if (years.length > 0) {
      response += `可用年份: ${years.join('、')}\n`;
    }

    return response;
  }

  /**
   * Handle stats
   */
  async handleStats(sessionId) {
    const stats = this.getStats(sessionId);
    return `📊 **学习统计**\n\n已答题数: ${stats.answeredCount}\n试卷总数: ${stats.totalPapers}\n题目总数: ${stats.totalQuestions}`;
  }

  /**
   * Get question by ID
   */
  async getQuestionById(questionId) {
    const db = getDatabase();
    const stmt = db.prepare(`
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
    return `📚 **申论教学助手 - 帮助**

**出题功能:**
• "随机给我一道题" - 随机出题
• "给我一道广东的第一题" - 指定省份和题号
• "给我一道2024年的题" - 指定年份

**练习功能:**
• "开始" - 获取答题引导
• "我的思路是..." - 提交思路获取分析
• "提示" - 获取提示
• "答案是..." - 提交答案获取评分

**数据管理:**
• "爬取XX省XXXX年试卷" - 下载试卷
• "处理XX省XXXX年试卷" - 解析试卷
• "有哪些试卷" - 查看可用试卷

**其他:**
• "统计" - 查看学习进度
• "帮助" - 显示此帮助`;
  }

  /**
   * Cleanup
   */
  cleanup() {
    closeDatabase();
    logger.info('Skill cleanup completed');
  }
}

/**
 * CLI Help text
 */
function printCliHelp() {
  console.log(`
申论教学助手 CLI

用法: node scripts/shenlun.js <command> [options]

命令:
  interactive, i         交互模式 (默认)
  question <条件>        智能出题
                         条件示例: "广东第一题" "2024年" "随机"
  guide                  获取答题引导
  hint                   获取提示
  score <答案>           评分答案
  stats                  查看学习统计
  scrape <省> <年>       爬取试卷
  process <省> <年>      处理试卷
  list                   查看可用试卷
  help, -h               显示帮助

示例:
  node scripts/shenlun.js                        # 交互模式
  node scripts/shenlun.js question "广东第一题"  # 指定条件出题
  node scripts/shenlun.js question "随机"        # 随机出题
  node scripts/shenlun.js guide                  # 获取引导
  node scripts/shenlun.js hint                   # 获取提示
  node scripts/shenlun.js score "我的答案"       # 评分
  node scripts/shenlun.js stats                  # 查看统计
  node scripts/shenlun.js scrape 广东 2024      # 爬取试卷
  node scripts/shenlun.js process 广东 2024      # 处理试卷
  node scripts/shenlun.js list                   # 查看可用试卷
`);
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Show help
  if (command === 'help' || command === '-h' || command === '--help') {
    printCliHelp();
    process.exit(0);
  }

  const skill = new ShenLunTeacherSkill();
  const sessionId = randomUUID();

  try {
    await skill.initialize();

    switch (command) {
      case 'scrape': {
        const province = args[1];
        const year = parseInt(args[2]);
        if (!province || !year) {
          console.error('错误: 需要指定省份和年份');
          console.error('用法: node src/index.js scrape <省份> <年份>');
          process.exit(1);
        }
        const result = await skill.scrapePaper(province, year);
        if (result.existing) {
          console.log(`试卷已存在 (ID: ${result.paperId})`);
        } else {
          console.log(`✅ 试卷爬取完成 (ID: ${result.paperId})`);
        }
        break;
      }

      case 'process': {
        const province = args[1];
        const year = parseInt(args[2]);
        if (!province || !year) {
          console.error('错误: 需要指定省份和年份');
          console.error('用法: node src/index.js process <省份> <年份>');
          process.exit(1);
        }
        const result = await skill.processPaper(province, year);
        if (result.alreadyProcessed) {
          console.log(`试卷已处理过 (ID: ${result.paperId})`);
        } else {
          console.log(`✅ 试卷处理完成`);
          console.log(`题目数: ${result.questions.length}`);
          console.log(`材料数: ${result.materials.length}`);
        }
        break;
      }

      case 'question':
      case 'q': {
        const condition = args.slice(1).join(' ') || '随机';
        const result = await skill.smartQuestion(sessionId, condition);

        if (result.error) {
          console.log(`\n❌ ${result.error}`);
          if (result.suggestion) {
            console.log(`\n${result.suggestion}`);
          }
          break;
        }

        if (result.needSelection) {
          console.log(`\n${result.message}\n`);
          result.options.forEach((opt, idx) => {
            const historyInfo = opt.history
              ? ` | 上次: ${opt.history.score}分`
              : ' | 未做过';
            console.log(`${idx + 1}. ${opt.province} ${opt.year}年 第${opt.questionNumber}题${historyInfo}`);
          });
          console.log('\n请使用 select 命令选择，例如: node src/index.js select 1');
          break;
        }

        console.log(skill.formatQuestionResult(result));
        break;
      }

      case 'select': {
        const selection = parseInt(args[1]);
        if (!selection) {
          console.error('错误: 需要指定选项序号');
          console.error('用法: node src/index.js select <序号>');
          process.exit(1);
        }
        // Note: CLI模式下的选择需要会话持久化，这里简化处理
        console.log('提示: 选择功能需要在交互模式下使用');
        console.log('请运行: node src/index.js');
        break;
      }

      case 'guide': {
        const result = await skill.startGuidance(sessionId);
        if (result.error) {
          console.log(result.error);
          console.log('请先获取题目: node src/index.js question "条件"');
        } else {
          console.log(`\n🎯 答题引导\n\n${result.guidance}\n`);
        }
        break;
      }

      case 'hint': {
        const result = await skill.provideHint(sessionId);
        if (result.error) {
          console.log(result.error);
          console.log('请先获取题目: node src/index.js question "条件"');
        } else {
          console.log(`\n💡 提示\n\n${result.hint}\n`);
        }
        break;
      }

      case 'score': {
        const answer = args.slice(1).join(' ');
        if (!answer) {
          console.error('错误: 需要提供答案');
          console.error('用法: node src/index.js score "你的答案"');
          process.exit(1);
        }
        const result = await skill.scoreAnswer(sessionId, answer);
        if (result.error) {
          console.log(result.error);
          console.log('请先获取题目: node src/index.js question "条件"');
        } else {
          console.log(skill.formatFeedback(result));
        }
        break;
      }

      case 'stats': {
        const stats = skill.getStats(sessionId);
        console.log(`\n📊 学习统计\n`);
        console.log(`已答题数: ${stats.answeredCount}`);
        console.log(`试卷总数: ${stats.totalPapers}`);
        console.log(`题目总数: ${stats.totalQuestions}\n`);
        break;
      }

      case 'list': {
        const { provinces, years, stats } = skill.getAvailablePapers();
        console.log(`\n📚 可用试卷信息\n`);
        console.log(`试卷总数: ${stats.totalPapers}`);
        console.log(`已处理: ${stats.processedPapers}`);
        console.log(`题目总数: ${stats.totalQuestions}\n`);
        if (provinces.length > 0) {
          console.log(`可用省份: ${provinces.join('、')}`);
        }
        if (years.length > 0) {
          console.log(`可用年份: ${years.join('、')}`);
        }
        console.log();
        break;
      }

      case 'interactive':
      case 'i':
      case undefined: {
        // Interactive mode
        console.log('申论教学助手已启动。输入"帮助"查看功能。');
        console.log('按 Ctrl+C 退出。\n');

        const readline = (await import('readline')).createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const prompt = () => {
          readline.question('你: ', async (input) => {
            if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
              readline.close();
              skill.cleanup();
              return;
            }

            try {
              const response = await skill.processInput(sessionId, input);
              console.log(`\n老师: ${response}\n`);
            } catch (error) {
              console.error(`错误: ${error.message}`);
            }

            prompt();
          });
        };

        prompt();
        return; // Don't cleanup, let readline handle exit
      }

      default:
        console.error(`未知命令: ${command}`);
        printCliHelp();
        process.exit(1);
    }

    skill.cleanup();
  } catch (error) {
    console.error('错误:', error.message);
    skill.cleanup();
    process.exit(1);
  }
}

// Export for module usage
export default ShenLunTeacherSkill;

// Run CLI if executed directly (支持 index.js 和打包后的 shenlun.js)
const entryFile = process.argv[1]?.split('/').pop()?.split('\\').pop();
if (entryFile === 'index.js' || entryFile === 'shenlun.js') {
  main();
}
