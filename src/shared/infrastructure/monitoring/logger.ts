import pino, { Logger } from 'pino';

const createLogger = (): Logger => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            levelFirst: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: () => ({
        node_version: process.version,
        environment: process.env.NODE_ENV || 'development'
      })
    },
    serializers: {
      error: pino.stdSerializers.err
    }
  });
};

export const logger: Logger = createLogger();
export default logger;
