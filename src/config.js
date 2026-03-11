import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file
config();

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CONFIG = {
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'glm-4-flash',
  },
  scraper: {
    baseUrl: process.env.SCRAPER_BASE_URL || 'https://www.aipta.com',
  },
  database: {
    path: process.env.DATABASE_PATH || join(__dirname, '..', 'data', 'shenlun.db'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  paths: {
    data: join(__dirname, '..', 'data'),
    root: join(__dirname, '..'),
  },
};

export function validateConfig() {
  const errors = [];

  if (!CONFIG.llm.apiKey) {
    errors.push('LLM_API_KEY is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }

  return true;
}
