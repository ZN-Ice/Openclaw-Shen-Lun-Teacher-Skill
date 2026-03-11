import { CONFIG } from '../config.js';
import { logger } from './logger.js';

/**
 * HTTP client wrapper with retry support
 */
export async function httpClient(url, options = {}) {
  const { retries = 3, timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      logger.warn(`HTTP request failed (attempt ${attempt}/${retries})`, {
        url: url.toString(),
        error: error.message,
      });

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  clearTimeout(timeoutId);
  throw lastError;
}

/**
 * Fetch HTML content with proper headers
 */
export async function fetchHtml(url) {
  return httpClient(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
}
