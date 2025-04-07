import { format, createLogger, transports, Logger } from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as fs from 'fs';
import * as path from 'path';

const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const customFormat = format.printf(({ timestamp, level, message, stack }) => {
  return `${timestamp} - [${level.toUpperCase().padEnd(7)}] - ${stack || message}`;
});

export function buildWinstonLogger(): Logger {
  return createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'silly',
    format: format.combine(format.timestamp(), format.errors({ stack: true }), customFormat),
    transports: [
      new transports.Console({ level: 'silly' }),
      new DailyRotateFile({
        filename: path.join(logsDir, '%DATE%.error.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '14d',
      }),
      new DailyRotateFile({
        filename: path.join(logsDir, '%DATE%.combined.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        maxFiles: '14d',
      }),
    ],
  });
}

export const logger = buildWinstonLogger();
