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
   * 从专题页面获取试卷链接
   */
  async findPaperFromZtPage(province, year) {
    const provinceCode = this.getProvinceCode(province);
    const ztUrl = `${this.baseUrl}/zt/sk/${provinceCode}/sl/`;
    logger.debug('Fetching zt page', { url: ztUrl });

    const html = await fetchHtml(ztUrl);

    // 使用正则匹配文章链接和标题
    const linkPattern = /href="([^"]*\/article\/\d+\.html)"[^>]*title="([^"]+)"[^>]*>/g;
    const matches = [];
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2];
      matches.push({ url, title });
    }

    logger.debug('Found articles on zt page', { count: matches.length });

    // 查找匹配年份的试卷
    const yearStr = String(year);
    for (const item of matches) {
      if (item.title.includes(yearStr) && item.title.includes('申论')) {
        // 优先选择"省市卷"或"通用卷"
        if (item.title.includes('省市卷') || item.title.includes('通用卷')) {
          logger.info('Matched paper', { title: item.title, url: item.url });
          return item.url;
        }
      }
    }

    // 如果没有找到省市卷/通用卷，返回第一个匹配的
    for (const item of matches) {
      if (item.title.includes(yearStr) && item.title.includes('申论')) {
        logger.info('Matched paper (fallback)', { title: item.title, url: item.url });
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
        const text = element.textContent
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim();

        if (text.length > 500) {
          return text;
        }
      }
    }

    // Fallback: get body text
    const body = doc.body;
    if (body) {
      const text = body.textContent.replace(/\s+/g, ' ').trim();
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
      北京: 'bj',
      上海: 'sh',
      天津: 'tj',
      重庆: 'cq',
      广东: 'gd',
      江苏: 'js',
      浙江: 'zj',
      山东: 'sd',
      河南: 'hn',
      四川: 'sc',
      湖南: 'hn',
      湖北: 'hb',
      安徽: 'ah',
      福建: 'fj',
      江西: 'jx',
      河北: 'he',
      山西: 'sx',
      辽宁: 'ln',
      吉林: 'jl',
      黑龙江: 'hlj',
      广西: 'gx',
      海南: 'han',
      贵州: 'gz',
      云南: 'yn',
      陕西: 'sn',
      甘肃: 'gs',
      青海: 'qh',
      内蒙古: 'nmg',
      新疆: 'xj',
      西藏: 'xz',
      宁夏: 'nx',
    };
    return codes[province] || province.toLowerCase();
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
