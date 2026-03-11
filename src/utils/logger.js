import { CONFIG } from '../config.js';

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LEVELS[CONFIG.logging.level] ?? LEVELS.info;

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, message, meta = {}) {
  const timestamp = formatTimestamp();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug(message, meta = {}) {
    if (currentLevel <= LEVELS.debug) {
      console.debug(formatMessage('debug', message, meta));
    }
  },
  info(message, meta = {}) {
    if (currentLevel <= LEVELS.info) {
      console.info(formatMessage('info', message, meta));
    }
  },
  warn(message, meta = {}) {
    if (currentLevel <= LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },
  error(message, meta = {}) {
    if (currentLevel <= LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },
};
