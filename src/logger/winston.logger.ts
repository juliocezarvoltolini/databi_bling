import { createLogger, format, transports } from 'winston';

// custom log display format
const customFormat = format.printf(({ timestamp, level, stack, message }) => {
  return `${timestamp} - [${level.toUpperCase().padEnd(7)}] - ${stack || message}`;
});

const options = {
  file: {
    filename: 'error.log',
    level: 'error',
  },
  console: {
    level: 'silly', // Logs de todos os níveis
  },
};

// for development environment
const devLogger = {
  format: format.combine(format.timestamp(), format.errors({ stack: true }), customFormat),
  transports: [new transports.Console(options.console)],
};

// for production environment
const prodLogger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  transports: [
    new transports.File(options.file), // Logs de nível "error"
    new transports.File({
      filename: 'combine.log',
      level: 'info', // Logs de nível "info" e superiores
    }),
  ],
});

// export log instance based on the current environment
console.log(process.env.NODE_ENV);
const instanceLogger = process.env.NODE_ENV === 'production' ? prodLogger : devLogger;

export const logger = createLogger(instanceLogger);
