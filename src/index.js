import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { CONFIG, validateConfig } from './config.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase, createSession, getSession, updateSession } from './db/index.js';
import { getScraper } from './modules/scraper.js';
import { getProcessor } from './modules/processor.js';
import { getQuestionBank } from './modules/question-bank.js';
import { getTutor } from './modules/tutor.js';
import { getScorer } from './modules/scorer.js';

// Load environment
config();

/**
 * Intent patterns for user input recognition
 */
const INTENT_PATTERNS = {
  // 出题相关
  give_question: [/出题/, /来一题/, /给我.*题/, /下一题/, /随机.*题/],
  specific_question: [/我要.*省.*年/, /指定.*题/, /选择.*题/],

  // 答题相关
  submit_answer: [/答案[是为]/, /我的答案/, /作答/, /提交/, /回答[是为]/],
  continue_answer: [/继续/, /补充/, /还有/],

  // 引导相关
  start_guide: [/开始/, /怎么答/, /如何思考/, /引导/, /提示/],
  analyze_thought: [/我的思路/, /我想/, /我是这样想/],
  request_hint: [/提示/, /暗示/, /点拨/],
  expand_topic: [/拓展/, /延伸/, /深入分析/],

  // 评分相关
  request_score: [/评分/, /打分/, /多少分/, /得分/],
  request_feedback: [/反馈/, /评价/, /点评/],

  // 数据相关
  scrape_paper: [/爬取/, /下载.*试卷/, /抓取/],
  process_paper: [/处理.*试卷/, /解析.*试卷/],

  // 其他
  help: [/帮助/, /help/, /怎么用/, /功能/],
  stats: [/统计/, /进度/, /做了多少/],
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
    this.questionBank = getQuestionBank();
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

    try {
      switch (intent) {
        case 'give_question':
          return await this.handleGiveQuestion(sessionId);

        case 'submit_answer':
          return await this.handleSubmitAnswer(sessionId, userInput);

        case 'start_guide':
          return await this.handleStartGuide(sessionId);

        case 'analyze_thought':
          return await this.handleAnalyzeThought(sessionId, userInput);

        case 'request_hint':
          return await this.handleRequestHint(sessionId);

        case 'request_score':
          return await this.handleRequestScore(sessionId);

        case 'scrape_paper':
          return await this.handleScrapePaper(userInput);

        case 'process_paper':
          return await this.handleProcessPaper(userInput);

        case 'help':
          return this.getHelpText();

        case 'stats':
          return await this.handleStats(sessionId);

        default:
          return await this.handleUnknown(sessionId, userInput);
      }
    } catch (error) {
      logger.error('Process input failed', { intent, error: error.message });
      return `处理请求时出错: ${error.message}`;
    }
  }

  /**
   * Handle give question request
   */
  async handleGiveQuestion(sessionId) {
    const question = this.questionBank.getRandomQuestion(sessionId);

    if (!question) {
      return '暂无可用的题目。请先爬取并处理试卷数据。';
    }

    // Update session
    updateSession(sessionId, {
      currentQuestionId: question.id,
      phase: 'answering',
    });

    const materials = this.questionBank.getQuestionWithMaterials(question.id);

    let response = `📝 **第${question.question_number}题** (${question.province} ${question.year}年)\n\n`;
    response += `**题目:**\n${question.question_text}\n\n`;

    if (question.requirements) {
      response += `**要求:**\n${question.requirements}\n\n`;
    }

    if (question.score) {
      response += `**分值:** ${question.score}分\n\n`;
    }

    if (materials.materials?.length > 0) {
      response += `**材料:**\n`;
      materials.materials.forEach((m) => {
        response += `\n【材料${m.material_number}】\n${m.content.substring(0, 500)}...\n`;
      });
    }

    response += '\n💡 输入"开始"获取答题引导，或直接输入你的答案。';

    return response;
  }

  /**
   * Handle submit answer
   */
  async handleSubmitAnswer(sessionId, userInput) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return '请先获取题目。输入"出题"开始练习。';
    }

    // Extract answer from input
    const answer = userInput.replace(/^(答案[是为]?|我的答案|作答|提交|回答[是为]?)[：:)]?\s*/i, '');

    // Get question info
    const question = await this.getQuestionById(session.current_question_id);

    if (!question) {
      return '题目信息丢失，请重新出题。';
    }

    const result = await this.scorer.scoreAnswer(sessionId, question, answer);
    const feedback = this.scorer.formatFeedback(result);

    updateSession(sessionId, { phase: 'reviewed' });

    return feedback;
  }

  /**
   * Handle start guide
   */
  async handleStartGuide(sessionId) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return '请先获取题目。输入"出题"开始练习。';
    }

    const question = await this.getQuestionById(session.current_question_id);
    const result = await this.tutor.startGuidance(question);

    updateSession(sessionId, { phase: 'guided' });

    return `🎯 **答题引导**\n\n${result.guidance}`;
  }

  /**
   * Handle analyze thought
   */
  async handleAnalyzeThought(sessionId, userInput) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return '请先获取题目。输入"出题"开始练习。';
    }

    const question = await this.getQuestionById(session.current_question_id);
    const thought = userInput.replace(/^(我的思路[是为]?|我想|我是这样想)[：:)]?\s*/i, '');

    const result = await this.tutor.analyzeThinking(question, thought);

    return `💭 **思路分析**\n\n${result.analysis}`;
  }

  /**
   * Handle request hint
   */
  async handleRequestHint(sessionId) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return '请先获取题目。输入"出题"开始练习。';
    }

    const question = await this.getQuestionById(session.current_question_id);
    const result = await this.tutor.provideHint(question, '正在思考中');

    return `💡 **提示**\n\n${result.hint}`;
  }

  /**
   * Handle request score
   */
  async handleRequestScore(sessionId) {
    const session = getSession(sessionId);
    if (!session?.current_question_id) {
      return '请先提交答案。';
    }

    return '请直接输入你的答案，系统会自动评分。';
  }

  /**
   * Handle scrape paper
   */
  async handleScrapePaper(userInput) {
    // Extract province and year from input
    const provinceMatch = userInput.match(/(\w+)省/);
    const yearMatch = userInput.match(/(\d{4})/);

    if (!provinceMatch || !yearMatch) {
      return '请指定省份和年份，例如："爬取广东省2024年试卷"';
    }

    const province = provinceMatch[1];
    const year = parseInt(yearMatch[1]);

    const result = await this.scraper.scrapePaper(province, year);

    if (result.existing) {
      return `试卷已存在 (ID: ${result.paperId})。输入"处理${province}省${year}年试卷"进行解析。`;
    }

    return `✅ 试卷爬取完成 (ID: ${result.paperId})\n\n输入"处理${province}省${year}年试卷"进行解析。`;
  }

  /**
   * Handle process paper
   */
  async handleProcessPaper(userInput) {
    const provinceMatch = userInput.match(/(\w+)省/);
    const yearMatch = userInput.match(/(\d{4})/);

    if (!provinceMatch || !yearMatch) {
      return '请指定省份和年份，例如："处理广东省2024年试卷"';
    }

    const province = provinceMatch[1];
    const year = parseInt(yearMatch[1]);

    const result = await this.processor.processPaper(province, year);

    if (result.alreadyProcessed) {
      return `试卷已处理过 (ID: ${result.paperId})`;
    }

    return `✅ 试卷处理完成\n\n` +
           `题目数: ${result.questions.length}\n` +
           `材料数: ${result.materials.length}\n` +
           (result.verification.issues.length > 0
             ? `\n⚠️ 问题: ${result.verification.issues.join(', ')}`
             : '');
  }

  /**
   * Handle stats
   */
  async handleStats(sessionId) {
    const stats = this.questionBank.getStats(sessionId);
    return `📊 **学习统计**\n\n已答题数: ${stats.answeredCount}`;
  }

  /**
   * Handle unknown intent
   */
  async handleUnknown(sessionId, userInput) {
    return `我不太理解你的意思。输入"帮助"查看可用功能。\n\n你说的是: "${userInput}"`;
  }

  /**
   * Get question by ID
   */
  async getQuestionById(questionId) {
    const db = (await import('./db/index.js')).getDatabase();
    const stmt = db.prepare(`
      SELECT q.*, p.province, p.year
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

**练习功能:**
• "出题" - 获取随机题目
• "开始" - 获取答题引导
• "我的思路是..." - 提交思路获取分析
• "提示" - 获取提示
• "答案是..." - 提交答案获取评分

**数据管理:**
• "爬取XX省XXXX年试卷" - 下载试卷
• "处理XX省XXXX年试卷" - 解析试卷

**其他:**
• "统计" - 查看学习进度
• "帮助" - 显示此帮助

**示例对话:**
1. 用户: 出题
2. 系统: [显示题目和材料]
3. 用户: 开始
4. 系统: [显示答题引导]
5. 用户: 我的思路是...
6. 系统: [分析思路]
7. 用户: 答案是...
8. 系统: [评分和反馈]`;
  }

  /**
   * Cleanup
   */
  cleanup() {
    closeDatabase();
    logger.info('Skill cleanup completed');
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const skill = new ShenLunTeacherSkill();

  try {
    await skill.initialize();

    if (command === 'scrape') {
      const province = args[1];
      const year = parseInt(args[2]);
      if (!province || !year) {
        console.error('Usage: node src/index.js scrape <province> <year>');
        process.exit(1);
      }
      const result = await skill.scraper.scrapePaper(province, year);
      console.log('Scrape result:', result);
    } else if (command === 'process') {
      const province = args[1];
      const year = parseInt(args[2]);
      if (!province || !year) {
        console.error('Usage: node src/index.js process <province> <year>');
        process.exit(1);
      }
      const result = await skill.processor.processPaper(province, year);
      console.log('Process result:', result);
    } else {
      // Interactive mode
      console.log('申论教学助手已启动。输入"帮助"查看功能。');
      console.log('按 Ctrl+C 退出。\n');

      const sessionId = randomUUID();
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
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module usage
export default ShenLunTeacherSkill;

// Run CLI if executed directly
if (process.argv[1]?.endsWith('index.js')) {
  main();
}
