/**
 * Structured Logger - Pino-like implementation
 *
 * Key features:
 * - Structured JSON logging
 * - Multiple log levels
 * - Zero dependencies (except optional transports)
 * - High performance (minimal overhead)
 * - Request ID tracking
 * - Pluggable transports (console, file, HTTP, custom)
 *
 * Performance optimizations:
 * - Pre-formatted timestamp (updated every second)
 * - Direct JSON.stringify for simple objects
 * - Minimal object creation
 * - Optional transport system
 */

import { Transport, transports as defaultTransports, LogEntry as TransportLogEntry } from './transports';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerOptions {
  level?: LogLevel;
  name?: string;
  prettyPrint?: boolean;
  enabled?: boolean;
  transport?: Transport;  // NEW: Optional transport
}

interface LogEntry {
  level: number;
  time: number;
  name?: string;
  msg: string;
  [key: string]: any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

const LEVEL_NAMES: Record<number, LogLevel> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal'
};

/**
 * Structured logger implementation
 */
export class Logger {
  private level: number;
  private name?: string;
  private prettyPrint: boolean;
  private enabled: boolean;
  private bindings: Record<string, any> = {};
  private transport: Transport;

  // OPTIMIZATION: Pre-format timestamp, update every second
  private static cachedTime: number = Date.now();
  private static timeUpdateInterval: NodeJS.Timeout;

  static {
    // Update cached time every second
    Logger.timeUpdateInterval = setInterval(() => {
      Logger.cachedTime = Date.now();
    }, 1000);

    // Allow process to exit
    Logger.timeUpdateInterval.unref();
  }

  constructor(options: LoggerOptions = {}) {
    this.level = LOG_LEVELS[options.level || 'info'];
    this.name = options.name;
    this.prettyPrint = options.prettyPrint ?? false;
    this.enabled = options.enabled ?? true;

    // NEW: Use custom transport or default console transport
    this.transport = options.transport || defaultTransports.console({
      prettyPrint: this.prettyPrint
    });
  }

  /**
   * Create child logger with additional bindings
   * OPTIMIZATION: Reuses parent configuration and transport
   */
  child(bindings: Record<string, any>): Logger {
    const child = new Logger({
      level: LEVEL_NAMES[this.level],
      name: this.name,
      prettyPrint: this.prettyPrint,
      enabled: this.enabled,
      transport: this.transport  // Share transport
    });
    child.bindings = { ...this.bindings, ...bindings };
    return child;
  }

  /**
   * Log at trace level
   */
  trace(msg: string, data?: Record<string, any>): void;
  trace(data: Record<string, any>, msg: string): void;
  trace(msgOrData: string | Record<string, any>, dataOrMsg?: string | Record<string, any>): void {
    this.log('trace', msgOrData, dataOrMsg);
  }

  /**
   * Log at debug level
   */
  debug(msg: string, data?: Record<string, any>): void;
  debug(data: Record<string, any>, msg: string): void;
  debug(msgOrData: string | Record<string, any>, dataOrMsg?: string | Record<string, any>): void {
    this.log('debug', msgOrData, dataOrMsg);
  }

  /**
   * Log at info level
   */
  info(msg: string, data?: Record<string, any>): void;
  info(data: Record<string, any>, msg: string): void;
  info(msgOrData: string | Record<string, any>, dataOrMsg?: string | Record<string, any>): void {
    this.log('info', msgOrData, dataOrMsg);
  }

  /**
   * Log at warn level
   */
  warn(msg: string, data?: Record<string, any>): void;
  warn(data: Record<string, any>, msg: string): void;
  warn(msgOrData: string | Record<string, any>, dataOrMsg?: string | Record<string, any>): void {
    this.log('warn', msgOrData, dataOrMsg);
  }

  /**
   * Log at error level
   */
  error(msg: string, data?: Record<string, any>): void;
  error(data: Record<string, any>, msg: string): void;
  error(err: Error, msg?: string): void;
  error(msgOrDataOrErr: string | Record<string, any> | Error, dataOrMsg?: string | Record<string, any>): void {
    // Handle Error object specially
    if (msgOrDataOrErr instanceof Error) {
      const err = msgOrDataOrErr;
      const msg = typeof dataOrMsg === 'string' ? dataOrMsg : err.message;
      this.log('error', msg, {
        err: {
          type: err.name,
          message: err.message,
          stack: err.stack
        }
      });
      return;
    }

    this.log('error', msgOrDataOrErr, dataOrMsg);
  }

  /**
   * Log at fatal level
   */
  fatal(msg: string, data?: Record<string, any>): void;
  fatal(data: Record<string, any>, msg: string): void;
  fatal(msgOrData: string | Record<string, any>, dataOrMsg?: string | Record<string, any>): void {
    this.log('fatal', msgOrData, dataOrMsg);
  }

  /**
   * Core logging function
   * OPTIMIZATION: Minimal object creation, direct output
   */
  private log(
    level: LogLevel,
    msgOrData: string | Record<string, any>,
    dataOrMsg?: string | Record<string, any>
  ): void {
    if (!this.enabled) return;

    const levelNum = LOG_LEVELS[level];
    if (levelNum < this.level) return;

    let msg: string;
    let data: Record<string, any> | undefined;

    // Parse arguments (support both signatures)
    if (typeof msgOrData === 'string') {
      msg = msgOrData;
      data = dataOrMsg as Record<string, any> | undefined;
    } else {
      data = msgOrData;
      msg = dataOrMsg as string;
    }

    // Build log entry
    const entry: LogEntry = {
      level: levelNum,
      time: Logger.cachedTime,
      msg
    };

    if (this.name) {
      entry.name = this.name;
    }

    // Merge bindings and data
    if (Object.keys(this.bindings).length > 0) {
      Object.assign(entry, this.bindings);
    }

    if (data) {
      Object.assign(entry, data);
    }

    // NEW: Use transport to write log entry
    // Transport handles formatting (JSON vs pretty) and destination (console, file, HTTP, etc.)
    this.transport.write(entry);
  }

  /**
   * Check if level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this.enabled && LOG_LEVELS[level] >= this.level;
  }
}

/**
 * Create a logger instance
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}

/**
 * Generate request ID
 * OPTIMIZATION: Simple counter-based ID, very fast
 */
let requestCounter = 0;
export function generateRequestId(): string {
  requestCounter = (requestCounter + 1) % 1000000;
  return `${Date.now()}-${requestCounter}`;
}
