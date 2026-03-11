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

    // Build URL (this is a placeholder - actual URL structure may vary)
    const url = this.buildPaperUrl(province, year);
    logger.debug('Fetching URL', { url });

    try {
      const html = await fetchHtml(url);
      const content = this.parsePaperContent(html);

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
        sourceUrl: url,
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
   * Build URL for exam paper (placeholder - adjust based on actual site structure)
   */
  buildPaperUrl(province, year) {
    // This is a placeholder - actual URL structure needs to be determined
    // based on the real website
    const provinceCode = this.getProvinceCode(province);
    return `${this.baseUrl}/shenlun/${provinceCode}/${year}.html`;
  }

  /**
   * Parse paper content from HTML
   */
  parsePaperContent(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Try common content selectors
    const selectors = [
      '.content',
      '.article-content',
      '.paper-content',
      'article',
      '.main-content',
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        // Clean up the content
        const content = element.textContent
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim();

        if (content.length > 100) {
          return content;
        }
      }
    }

    // Fallback: get all text
    const body = doc.body;
    if (body) {
      return body.textContent.replace(/\s+/g, ' ').trim();
    }

    return null;
  }

  /**
   * Get province code (placeholder mapping)
   */
  getProvinceCode(province) {
    const codes = {
      北京: 'beijing',
      上海: 'shanghai',
      天津: 'tianjin',
      重庆: 'chongqing',
      广东: 'guangdong',
      江苏: 'jiangsu',
      浙江: 'zhejiang',
      山东: 'shandong',
      河南: 'henan',
      四川: 'sichuan',
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
