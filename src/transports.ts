/**
 * Log Transports System
 *
 * Inspired by Pino transports but simpler
 * Allows sending logs to different destinations:
 * - Console (stdout/stderr)
 * - File
 * - HTTP endpoint
 * - Custom handler
 */

import { WriteStream, createWriteStream } from 'fs';
import { Transform } from 'stream';

export interface LogEntry {
  level: number;
  time: number;
  name?: string;
  msg: string;
  [key: string]: any;
}

/**
 * Transport interface - all transports implement this
 */
export interface Transport {
  write(entry: LogEntry): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

/**
 * Console Transport
 * Writes to stdout (info/debug) or stderr (warn/error)
 */
export class ConsoleTransport implements Transport {
  private prettyPrint: boolean;

  constructor(options: { prettyPrint?: boolean } = {}) {
    this.prettyPrint = options.prettyPrint ?? false;
  }

  write(entry: LogEntry): void {
    const output = this.prettyPrint
      ? this.formatPretty(entry)
      : JSON.stringify(entry);

    // Write to stderr for errors, stdout for others
    if (entry.level >= 50) {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  private formatPretty(entry: LogEntry): string {
    const time = new Date(entry.time).toISOString();
    const levelNames: Record<number, string> = {
      10: 'TRACE',
      20: 'DEBUG',
      30: 'INFO ',
      40: 'WARN ',
      50: 'ERROR',
      60: 'FATAL'
    };

    const colors: Record<number, string> = {
      10: '\x1b[90m', // gray
      20: '\x1b[36m', // cyan
      30: '\x1b[32m', // green
      40: '\x1b[33m', // yellow
      50: '\x1b[31m', // red
      60: '\x1b[35m'  // magenta
    };
    const reset = '\x1b[0m';

    const level = levelNames[entry.level] || 'UNKNO';
    const color = colors[entry.level] || '';
    const name = entry.name ? `[${entry.name}]` : '';

    let output = `${color}${time} ${level}${reset} ${name} ${entry.msg}`;

    // Add extra fields
    const extraFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (key !== 'level' && key !== 'time' && key !== 'msg' && key !== 'name') {
        extraFields[key] = value;
      }
    }

    if (Object.keys(extraFields).length > 0) {
      output += '\n' + JSON.stringify(extraFields, null, 2);
    }

    return output;
  }
}

/**
 * File Transport
 * Writes logs to a file with optional rotation
 */
export class FileTransport implements Transport {
  private stream: WriteStream;
  private buffer: string[] = [];
  private bufferSize: number;
  private flushInterval: NodeJS.Timeout;

  constructor(options: {
    path: string;
    bufferSize?: number;
    flushIntervalMs?: number;
  }) {
    this.stream = createWriteStream(options.path, {
      flags: 'a',
      encoding: 'utf8'
    });

    this.bufferSize = options.bufferSize || 100;
    const flushMs = options.flushIntervalMs || 1000;

    // Periodic flush
    this.flushInterval = setInterval(() => {
      this.flush();
    }, flushMs);

    // Allow process to exit
    this.flushInterval.unref();
  }

  write(entry: LogEntry): void {
    this.buffer.push(JSON.stringify(entry));

    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const lines = this.buffer.join('\n') + '\n';
    this.stream.write(lines);
    this.buffer = [];
  }

  close(): void {
    clearInterval(this.flushInterval);
    this.flush();
    this.stream.end();
  }
}

/**
 * HTTP Transport
 * Sends logs to an HTTP endpoint (e.g., log aggregation service)
 */
export class HttpTransport implements Transport {
  private url: string;
  private headers: Record<string, string>;
  private buffer: LogEntry[] = [];
  private bufferSize: number;
  private flushInterval: NodeJS.Timeout;

  constructor(options: {
    url: string;
    headers?: Record<string, string>;
    bufferSize?: number;
    flushIntervalMs?: number;
  }) {
    this.url = options.url;
    this.headers = options.headers || { 'Content-Type': 'application/json' };
    this.bufferSize = options.bufferSize || 50;

    const flushMs = options.flushIntervalMs || 5000;

    this.flushInterval = setInterval(() => {
      this.flush();
    }, flushMs);

    this.flushInterval.unref();
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const logs = [...this.buffer];
    this.buffer = [];

    try {
      await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ logs })
      });
    } catch (err) {
      // Don't throw - log transport errors shouldn't crash the app
      console.error('HTTP transport error:', err);
    }
  }

  close(): void {
    clearInterval(this.flushInterval);
    this.flush();
  }
}

/**
 * Multi Transport
 * Sends logs to multiple transports simultaneously
 */
export class MultiTransport implements Transport {
  private transports: Transport[];

  constructor(transports: Transport[]) {
    this.transports = transports;
  }

  write(entry: LogEntry): void {
    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch (err) {
        // Don't let one transport failure affect others
        console.error('Transport write error:', err);
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.transports
        .filter(t => t.flush)
        .map(t => t.flush!())
    );
  }

  async close(): Promise<void> {
    await Promise.all(
      this.transports
        .filter(t => t.close)
        .map(t => t.close!())
    );
  }
}

/**
 * Custom Function Transport
 * Allows custom log handling logic
 */
export class FunctionTransport implements Transport {
  private fn: (entry: LogEntry) => void | Promise<void>;

  constructor(fn: (entry: LogEntry) => void | Promise<void>) {
    this.fn = fn;
  }

  write(entry: LogEntry): void {
    try {
      const result = this.fn(entry);
      if (result instanceof Promise) {
        result.catch(err => {
          console.error('Function transport error:', err);
        });
      }
    } catch (err) {
      console.error('Function transport error:', err);
    }
  }
}

/**
 * Filtering Transport
 * Wraps another transport and filters entries based on criteria
 */
export class FilterTransport implements Transport {
  private transport: Transport;
  private filter: (entry: LogEntry) => boolean;

  constructor(
    transport: Transport,
    filter: (entry: LogEntry) => boolean
  ) {
    this.transport = transport;
    this.filter = filter;
  }

  write(entry: LogEntry): void {
    if (this.filter(entry)) {
      this.transport.write(entry);
    }
  }

  flush(): void | Promise<void> {
    return this.transport.flush?.();
  }

  close(): void | Promise<void> {
    return this.transport.close?.();
  }
}

/**
 * Factory functions for common transports
 */
export const transports = {
  /**
   * Console transport (stdout/stderr)
   */
  console(options?: { prettyPrint?: boolean }): Transport {
    return new ConsoleTransport(options);
  },

  /**
   * File transport with buffering
   */
  file(path: string, options?: { bufferSize?: number; flushIntervalMs?: number }): Transport {
    return new FileTransport({ path, ...options });
  },

  /**
   * HTTP endpoint transport
   */
  http(url: string, options?: { headers?: Record<string, string>; bufferSize?: number }): Transport {
    return new HttpTransport({ url, ...options });
  },

  /**
   * Custom function transport
   */
  custom(fn: (entry: LogEntry) => void | Promise<void>): Transport {
    return new FunctionTransport(fn);
  },

  /**
   * Multiple transports
   */
  multi(...transports: Transport[]): Transport {
    return new MultiTransport(transports);
  },

  /**
   * Filtered transport
   */
  filter(transport: Transport, filter: (entry: LogEntry) => boolean): Transport {
    return new FilterTransport(transport, filter);
  }
};
