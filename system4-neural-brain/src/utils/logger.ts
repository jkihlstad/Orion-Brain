/**
 * Logger Utility
 *
 * Structured logging for the Neural Intelligence Platform.
 * TODO: Replace with production logging service (e.g., Pino, Winston, DataDog)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private serviceName: string;

  constructor(serviceName: string = 'neural-brain', minLevel: LogLevel = 'info') {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    return JSON.stringify({
      ...entry,
      service: this.serviceName,
    });
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }

  child(context: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, context);
  }
}

class ChildLogger {
  private parent: Logger;
  private baseContext: Record<string, unknown>;

  constructor(parent: Logger, context: Record<string, unknown>) {
    this.parent = parent;
    this.baseContext = context;
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.parent.debug(message, { ...this.baseContext, ...context });
  }

  info(message: string, context?: Record<string, unknown>) {
    this.parent.info(message, { ...this.baseContext, ...context });
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.parent.warn(message, { ...this.baseContext, ...context });
  }

  error(message: string, context?: Record<string, unknown>) {
    this.parent.error(message, { ...this.baseContext, ...context });
  }
}

// Singleton logger instance
export const logger = new Logger(
  process.env.SERVICE_NAME || 'neural-brain',
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);
