import { JSDOM } from 'jsdom';
import { CONFIG } from '../config.js';
import { fetchHtml } from '../utils/http-client.js';
import { logger } from '../utils/logger.js';
import { createPaper, findPaperByProvinceYear } from '../db/index.js';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Scraper module for downloading exam papers from aipta.com
 */
export class Scraper {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || CONFIG.scraper.baseUrl;
  }

  /**
   * Scrape exam paper from aipta.com
   */
  async scrapePaper(province, year) {
    logger.info('Starting scrape', { province, year });

    // Check if already scraped
    const existing = findPaperByProvinceYear(province, year);
    if (existing) {
      logger.info('Paper already exists', { paperId: existing.id });
      return { existing: true, paperId: existing.id };
    }

    try {
      // 通过专题页找到试卷链接
      const articleUrl = await this.findPaperFromZtPage(province, year);

      if (!articleUrl) {
        throw new Error(`未找到 ${province} ${year} 年的试卷`);
      }

      logger.info('Found paper URL', { url: articleUrl });

      // 获取试卷内容
      const html = await fetchHtml(articleUrl);
      const content = this.parseArticleContent(html);

      if (!content) {
        throw new Error('Failed to parse paper content');
      }

      // Create data directory
      const dataDir = join(CONFIG.paths.data, `${province}省考_${year}`);
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      // Save raw content
      const originPath = join(dataDir, 'origin.txt');
      writeFileSync(originPath, content, 'utf-8');
      logger.info('Saved raw content', { path: originPath });

      // Save to database
      const paperId = createPaper({
        source: 'aipta',
        sourceUrl: articleUrl,
        province,
        year,
        rawContent: content,
      });

      logger.info('Paper created', { paperId });

      return { existing: false, paperId, content, dataDir };
    } catch (error) {
      logger.error('Scrape failed', { province, year, error: error.message });
      throw error;
    }
  }

  /**
   * 查找试卷链接（统一入口）
   * 策略：专题页优先 -> 标签页搜索备用
   */
  async findPaperFromZtPage(province, year) {
    // 策略1: 从专题页获取
    const provinceCode = this.getProvinceCode(province);
    const ztUrl = `${this.baseUrl}/zt/sk/${provinceCode}/sl/`;
    logger.debug('Trying zt page', { url: ztUrl });

    try {
      const html = await fetchHtml(ztUrl);

      // 匹配文章链接和标题
      const linkPattern = /href="([^"]*\/article\/\d+\.html)"[^>]*title="([^"]+)"[^>]*>/g;
      const matches = [];
      let match;

      while ((match = linkPattern.exec(html)) !== null) {
        matches.push({ url: match[1], title: match[2] });
      }

      logger.debug('Zt page results', { count: matches.length });

      const yearStr = String(year);
      const provinceVariants = this.getProvinceVariants(province);

      // 优先匹配：年份 + 省份 + 省市卷/通用卷
      for (const item of matches) {
        if (item.title.includes(yearStr) && item.title.includes('申论')) {
          const hasProvince = provinceVariants.some(v => item.title.includes(v));
          if (!hasProvince) continue;

          if (item.title.includes('省市卷') || item.title.includes('通用卷')) {
            logger.info('Found paper on zt page (priority)', { title: item.title, url: item.url });
            return item.url;
          }
        }
      }

      // 回退匹配
      for (const item of matches) {
        if (item.title.includes(yearStr) && item.title.includes('申论')) {
          const hasProvince = provinceVariants.some(v => item.title.includes(v));
          if (!hasProvince) continue;

          logger.info('Found paper on zt page (fallback)', { title: item.title, url: item.url });
          return item.url;
        }
      }
    } catch (error) {
      logger.debug('Zt page not available', { url: ztUrl, error: error.message });
    }

    // 策略2: 从标签页搜索
    logger.info('Trying tag page search', { province, year });
    return await this.searchFromTagPage(province, year);
  }

  /**
   * 从申论真题标签页搜索
   */
  async searchFromTagPage(province, year) {
    const tagUrl = `${this.baseUrl}/tag/shenlunzhenti.html`;
    logger.debug('Searching from tag page', { url: tagUrl, province, year });

    const html = await fetchHtml(tagUrl);

    // 匹配文章链接和标题（支持绝对路径和相对路径）
    const linkPattern = /href="(https?:\/\/[^"]*\/article\/\d+\.html|[^"]*\/article\/\d+\.html)"[^>]*title="([^"]+)"[^>]*>/g;
    const matches = [];
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].trim();
      if (title && title.includes('申论')) {
        matches.push({ url, title });
      }
    }

    logger.debug('Tag page results', { count: matches.length });

    const yearStr = String(year);
    const provinceVariants = this.getProvinceVariants(province);

    // 优先匹配：年份 + 省份 + 省市卷/通用卷
    for (const item of matches) {
      if (item.title.includes(yearStr)) {
        const hasProvince = provinceVariants.some(v => item.title.includes(v));
        if (!hasProvince) continue;

        if (item.title.includes('省市卷') || item.title.includes('通用卷')) {
          logger.info('Found paper via tag page (priority)', { title: item.title, url: item.url });
          return item.url;
        }
      }
    }

    // 回退匹配：年份 + 省份
    for (const item of matches) {
      if (item.title.includes(yearStr)) {
        const hasProvince = provinceVariants.some(v => item.title.includes(v));
        if (!hasProvince) continue;

        logger.info('Found paper via tag page (fallback)', { title: item.title, url: item.url });
        return item.url;
      }
    }

    return null;
  }

  /**
   * 获取省份代码（专题页 URL 用）
   */
  getProvinceCode(province) {
    const codes = {
      北京: 'bj', 上海: 'sh', 天津: 'tj', 重庆: 'cq',
      广东: 'gd', 江苏: 'js', 浙江: 'zj', 山东: 'sd',
      河南: 'he', 四川: 'sc', 湖南: 'hn', 湖北: 'hu',
      安徽: 'ah', 福建: 'fj', 江西: 'jx', 河北: 'hb',
      山西: 'sx', 辽宁: 'ln', 吉林: 'jl', 黑龙江: 'hlj',
      广西: 'gx', 海南: 'han', 贵州: 'gz', 云南: 'yn',
      陕西: 'sn', 甘肃: 'gs', 青海: 'qh',
      内蒙古: 'nmg', 新疆: 'xj', 西藏: 'xz', 宁夏: 'nx',
    };
    return codes[province] || province.toLowerCase();
  }

  /**
   * 获取省份名称变体（用于标题匹配）
   */
  getProvinceVariants(province) {
    const variants = {
      '内蒙古': ['内蒙古', '内蒙古公务员'],
      '广西': ['广西', '广西公务员'],
      '宁夏': ['宁夏', '宁夏公务员'],
      '新疆': ['新疆', '新疆公务员'],
      '西藏': ['西藏', '西藏公务员'],
    };

    // 默认返回省份名和"省考"形式
    return variants[province] || [province, province + '省考', province + '公务员'];
  }

  /**
   * Parse article content from HTML
   */
  parseArticleContent(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // 尝试获取文章主体内容
    const selectors = [
      '.article-content',
      '.content',
      '.paper-content',
      'article',
      '.main-content',
      '.post-content',
      '#content',
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        // 使用递归方式提取文本，保留块级元素的换行
        const text = this.extractTextWithStructure(element);
        if (text.length > 500) {
          return text;
        }
      }
    }

    // Fallback: get body text
    const body = doc.body;
    if (body) {
      const text = this.extractTextWithStructure(body);
      if (text.length > 100) {
        return text;
      }
    }

    return null;
  }

  /**
   * 递归提取文本，保留块级元素的结构
   */
  extractTextWithStructure(element) {
    const blockElements = ['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'LI', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE'];

    let result = '';

    const processNode = (node) => {
      if (node.nodeType === 3) { // Text node
        const text = node.textContent
          .replace(/[ \t]+/g, ' ')  // 压缩空格
          .trim();
        if (text) {
          result += text;
        }
      } else if (node.nodeType === 1) { // Element node
        const tagName = node.tagName.toUpperCase();

        // 块级元素前添加换行
        if (blockElements.includes(tagName)) {
          if (result && !result.endsWith('\n')) {
            result += '\n';
          }
        }

        // 处理子节点
        for (const child of node.childNodes) {
          processNode(child);
        }

        // 块级元素后添加换行
        if (blockElements.includes(tagName)) {
          if (result && !result.endsWith('\n')) {
            result += '\n';
          }
        }
      }
    };

    for (const child of element.childNodes) {
      processNode(child);
    }

    // 清理多余换行
    return result
      .replace(/\n{3,}/g, '\n\n')  // 多个换行压缩为两个
      .replace(/[ \t]+\n/g, '\n')  // 移除行尾空格
      .trim();
  }
}

// Singleton
let scraperInstance = null;

export function getScraper() {
  if (!scraperInstance) {
    scraperInstance = new Scraper();
  }
  return scraperInstance;
}
