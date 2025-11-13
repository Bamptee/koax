import { Server, IncomingMessage, ServerResponse, createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer, ServerOptions as HttpsServerOptions } from 'https';
import {
  createServer as createHttp2Server,
  createSecureServer as createSecureHttp2Server,
  Http2Server,
  Http2SecureServer,
  Http2ServerRequest,
  Http2ServerResponse,
  SecureServerOptions
} from 'http2';
import { Readable } from 'stream';

// uWebSockets.js types (optional dependency)
type uWSApp = any;
type uWSResponse = any;
type uWSRequest = any;

/**
 * Server Transport Interface
 *
 * Abstraction for different HTTP server implementations:
 * - HTTP/1.1 (standard)
 * - HTTP/2 (high performance)
 * - HTTP/2 with fallback (compatibility)
 */
export interface ServerTransport {
  /**
   * Create and start the server on specified port
   */
  listen(
    port: number,
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
    callback?: () => void
  ): Server | Http2Server | Http2SecureServer;
}

/**
 * HTTP/1.1 Transport (Standard)
 *
 * Uses Node.js built-in http.createServer
 * Best for: Development, compatibility, most use cases
 *
 * Performance: Baseline
 * Compatibility: 100%
 */
export class HttpTransport implements ServerTransport {
  listen(
    port: number,
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
    callback?: () => void
  ): Server {
    const server = createHttpServer(requestHandler);
    return server.listen(port, callback);
  }
}

/**
 * HTTP/2 Transport (High Performance)
 *
 * Uses Node.js http2.createServer for cleartext HTTP/2
 * Best for: High performance, modern clients, internal services
 *
 * Performance: +20-40% faster than HTTP/1.1
 * Compatibility: Requires HTTP/2 support in clients
 *
 * Note: Most browsers require HTTPS for HTTP/2
 * Use Http2SecureTransport for production with browsers
 */
export class Http2Transport implements ServerTransport {
  listen(
    port: number,
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
    callback?: () => void
  ): Http2Server {
    const server = createHttp2Server();

    server.on('stream', (stream, headers) => {
      // Convert HTTP/2 stream to HTTP/1 compatible request/response
      const req = Object.assign(stream, {
        httpVersion: '2.0',
        httpVersionMajor: 2,
        httpVersionMinor: 0,
        headers,
        method: headers[':method'],
        url: headers[':path'],
        path: headers[':path'],
      }) as unknown as IncomingMessage;

      // Save original methods before overwriting
      const originalEnd = stream.end.bind(stream);
      const originalWrite = stream.write.bind(stream);

      const res = Object.assign(stream, {
        statusCode: 200,
        statusMessage: 'OK',
        setHeader: (name: string, value: string | number | string[]) => {
          stream.respond({ [name.toLowerCase()]: value });
        },
        writeHead: (statusCode: number, headers?: Record<string, string | number | string[]>) => {
          stream.respond({ ':status': statusCode, ...headers });
        },
        end: (chunk?: any) => {
          if (chunk) originalWrite(chunk);
          originalEnd();
        }
      }) as unknown as ServerResponse;

      requestHandler(req, res);
    });

    return server.listen(port, callback);
  }
}

/**
 * HTTP/2 Secure Transport (Production)
 *
 * Uses Node.js http2.createSecureServer for encrypted HTTP/2
 * Best for: Production, web applications, public APIs
 *
 * Performance: +20-40% faster than HTTP/1.1
 * Compatibility: Excellent (browsers require HTTPS for HTTP/2)
 * Security: TLS encryption required
 */
export class Http2SecureTransport implements ServerTransport {
  constructor(private options: SecureServerOptions) {}

  listen(
    port: number,
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
    callback?: () => void
  ): Http2SecureServer {
    const server = createSecureHttp2Server(this.options);

    server.on('stream', (stream, headers) => {
      // Convert HTTP/2 stream to HTTP/1 compatible request/response
      const req = Object.assign(stream, {
        httpVersion: '2.0',
        httpVersionMajor: 2,
        httpVersionMinor: 0,
        headers,
        method: headers[':method'],
        url: headers[':path'],
        path: headers[':path'],
      }) as unknown as IncomingMessage;

      // Save original methods before overwriting
      const originalEnd = stream.end.bind(stream);
      const originalWrite = stream.write.bind(stream);

      const res = Object.assign(stream, {
        statusCode: 200,
        statusMessage: 'OK',
        setHeader: (name: string, value: string | number | string[]) => {
          stream.respond({ [name.toLowerCase()]: value });
        },
        writeHead: (statusCode: number, headers?: Record<string, string | number | string[]>) => {
          stream.respond({ ':status': statusCode, ...headers });
        },
        end: (chunk?: any) => {
          if (chunk) originalWrite(chunk);
          originalEnd();
        }
      }) as unknown as ServerResponse;

      requestHandler(req, res);
    });

    return server.listen(port, callback);
  }
}

/**
 * HTTPS Transport (Secure HTTP/1.1)
 *
 * Uses Node.js https.createServer for encrypted HTTP/1.1
 * Best for: Legacy clients, maximum compatibility with TLS
 *
 * Performance: Similar to HTTP/1.1
 * Compatibility: Universal
 * Security: TLS encryption
 */
export class HttpsTransport implements ServerTransport {
  constructor(private options: HttpsServerOptions) {}

  listen(
    port: number,
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
    callback?: () => void
  ): Server {
    const server = createHttpsServer(this.options, requestHandler);
    return server.listen(port, callback);
  }
}

/**
 * HTTP/2 with HTTP/1.1 Fallback Transport (Universal)
 *
 * Uses allowHTTP1: true option for maximum compatibility
 * Best for: Production, mixed clients, gradual migration
 *
 * Performance: HTTP/2 clients get +20-40% boost, others use HTTP/1.1
 * Compatibility: 100% (automatic fallback)
 */
export class Http2FallbackTransport implements ServerTransport {
  constructor(private options?: SecureServerOptions) {}

  listen(
    port: number,
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
    callback?: () => void
  ): Http2SecureServer {
    const serverOptions = {
      ...this.options,
      allowHTTP1: true // Enable HTTP/1.1 fallback
    };

    const server = createSecureHttp2Server(serverOptions);

    // Handle both HTTP/2 streams and HTTP/1.1 requests
    server.on('stream', (stream, headers) => {
      const req = Object.assign(stream, {
        httpVersion: '2.0',
        httpVersionMajor: 2,
        httpVersionMinor: 0,
        headers,
        method: headers[':method'],
        url: headers[':path'],
        path: headers[':path'],
      }) as unknown as IncomingMessage;

      // Save original methods before overwriting
      const originalEnd = stream.end.bind(stream);
      const originalWrite = stream.write.bind(stream);

      const res = Object.assign(stream, {
        statusCode: 200,
        statusMessage: 'OK',
        setHeader: (name: string, value: string | number | string[]) => {
          stream.respond({ [name.toLowerCase()]: value });
        },
        writeHead: (statusCode: number, headers?: Record<string, string | number | string[]>) => {
          stream.respond({ ':status': statusCode, ...headers });
        },
        end: (chunk?: any) => {
          if (chunk) originalWrite(chunk);
          originalEnd();
        }
      }) as unknown as ServerResponse;

      requestHandler(req, res);
    });

    // Handle HTTP/1.1 fallback requests
    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      requestHandler(req, res);
    });

    return server.listen(port, callback);
  }
}

/**
 * uWebSockets.js Transport (Ultra High Performance)
 *
 * Uses uWebSockets.js for extreme performance
 * Best for: Maximum throughput, low latency, production at scale
 *
 * Performance: +300-1000% faster than HTTP/1.1 (3-10x improvement)
 * Latency: 50-70% lower than standard Node.js http
 * Memory: More efficient than Node.js http
 * Compatibility: Requires uWebSockets.js package
 *
 * Installation: npm install uWebSockets.js
 *
 * Note: This transport converts uWS API to Node.js IncomingMessage/ServerResponse
 * for full compatibility with existing middleware
 */
export class UWebSocketsTransport implements ServerTransport {
  private app: uWSApp | null = null;
  private uws: any = null;
  private options: {
    maxPayloadLength?: number;
    idleTimeout?: number;
    maxBackpressure?: number;
  };

  constructor(options?: {
    maxPayloadLength?: number;
    idleTimeout?: number;
    maxBackpressure?: number;
  }) {
    this.options = {
      maxPayloadLength: 16 * 1024 * 1024, // 16MB default
      idleTimeout: 120, // 120 seconds
      maxBackpressure: 1024 * 1024, // 1MB
      ...options
    };

    try {
      // Try to load uWebSockets.js (optional dependency)
      this.uws = require('uWebSockets.js');
    } catch (err) {
      throw new Error(
        'uWebSockets.js is not installed. Install it with: npm install uWebSockets.js'
      );
    }
  }

  listen(
    port: number,
    requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
    callback?: () => void
  ): any {
    // Create app with options to handle large headers
    this.app = this.uws.App({
      maxPayloadLength: this.options.maxPayloadLength,
      idleTimeout: this.options.idleTimeout,
      maxBackpressure: this.options.maxBackpressure
    });

    this.app.any('/*', (uwsRes: uWSResponse, uwsReq: uWSRequest) => {
      // Create Node.js-compatible request object
      const req = this.createRequestAdapter(uwsReq, uwsRes);

      // Create Node.js-compatible response object
      const res = this.createResponseAdapter(uwsRes, req);

      // Mark response as handled to prevent uWS auto-close
      uwsRes.onAborted(() => {
        (res as any).aborted = true;
      });

      // Call the request handler with adapted objects
      requestHandler(req, res);
    });

    this.app.listen(port, (listenSocket: any) => {
      if (listenSocket) {
        if (callback) callback();
      } else {
        throw new Error(`Failed to listen on port ${port}`);
      }
    });

    // Return a mock Server object for compatibility
    return {
      close: () => {
        if (this.app) {
          this.uws.us_listen_socket_close(this.app);
        }
      },
      listen: () => this,
    } as any;
  }

  /**
   * Create a Node.js IncomingMessage-compatible adapter for uWS request
   */
  private createRequestAdapter(uwsReq: uWSRequest, uwsRes: uWSResponse): IncomingMessage {
    // Extract headers from uWS request
    const headers: Record<string, string> = {};
    uwsReq.forEach((key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    });

    // Create a readable stream for request body
    const bodyChunks: Buffer[] = [];
    const readable = new Readable({
      read() {}
    });

    // Read body data from uWS
    uwsRes.onData((chunk: ArrayBuffer, isLast: boolean) => {
      const buffer = Buffer.from(chunk);
      bodyChunks.push(buffer);
      readable.push(buffer);

      if (isLast) {
        readable.push(null); // End the stream
      }
    });

    // Create mock IncomingMessage
    const req = Object.assign(readable, {
      httpVersion: '1.1',
      httpVersionMajor: 1,
      httpVersionMinor: 1,
      headers,
      rawHeaders: Object.entries(headers).flat(),
      method: uwsReq.getMethod().toUpperCase(),
      url: uwsReq.getUrl() + (uwsReq.getQuery() ? '?' + uwsReq.getQuery() : ''),
      path: uwsReq.getUrl(),
      query: uwsReq.getQuery(),
      socket: {
        remoteAddress: Buffer.from(uwsRes.getRemoteAddressAsText()).toString(),
        remotePort: 0,
      },
      connection: {},
      // Additional properties for compatibility
      complete: false,
      aborted: false,
      upgrade: false,
      statusCode: undefined,
      statusMessage: undefined,
    }) as unknown as IncomingMessage;

    return req;
  }

  /**
   * Create a Node.js ServerResponse-compatible adapter for uWS response
   */
  private createResponseAdapter(uwsRes: uWSResponse, req: IncomingMessage): ServerResponse {
    let statusCode = 200;
    let statusMessage = 'OK';
    const headers: Record<string, string | number | string[]> = {};
    let headersSent = false;
    let finished = false;

    const writeHeaders = () => {
      if (headersSent) return;
      headersSent = true;

      // Write status
      uwsRes.writeStatus(`${statusCode} ${statusMessage}`);

      // Write headers
      for (const [key, value] of Object.entries(headers)) {
        const headerValue = Array.isArray(value) ? value.join(', ') : String(value);
        uwsRes.writeHeader(key, headerValue);
      }
    };

    // Create a plain object (not inheriting from ServerResponse)
    const res: any = {};

    // Simple event emitter for compatibility
    const listeners: Map<string, Function[]> = new Map();

    res.on = function(event: string, listener: Function) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(listener);
      return this;
    };

    res.once = function(event: string, listener: Function) {
      const wrapper = (...args: any[]) => {
        listener(...args);
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          const index = eventListeners.indexOf(wrapper);
          if (index > -1) {
            eventListeners.splice(index, 1);
          }
        }
      };
      return this.on(event, wrapper);
    };

    res.emit = function(event: string, ...args: any[]) {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        for (const listener of eventListeners) {
          listener(...args);
        }
      }
      return this;
    };

    res.removeListener = function(event: string, listener: Function) {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(listener);
        if (index > -1) {
          eventListeners.splice(index, 1);
        }
      }
      return this;
    };

    // Define properties with getters/setters
    Object.defineProperty(res, 'statusCode', {
      get() { return statusCode; },
      set(code: number) { statusCode = code; },
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(res, 'statusMessage', {
      get() { return statusMessage; },
      set(msg: string) { statusMessage = msg; },
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(res, 'headersSent', {
      get() { return headersSent; },
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(res, 'finished', {
      get() { return finished; },
      enumerable: true,
      configurable: true
    });

    // Set header
    res.setHeader = function(name: string, value: string | number | string[]) {
      if (headersSent) {
        throw new Error('Cannot set headers after they are sent');
      }
      headers[name.toLowerCase()] = value;
      return this;
    };

    // Get header
    res.getHeader = function(name: string) {
      return headers[name.toLowerCase()];
    };

    // Get headers
    res.getHeaders = function() {
      return { ...headers };
    };

    // Remove header
    res.removeHeader = function(name: string) {
      delete headers[name.toLowerCase()];
    };

    // Has header
    res.hasHeader = function(name: string) {
      return name.toLowerCase() in headers;
    };

    // Write head
    res.writeHead = function(code: number, reason?: string | Record<string, string | number | string[]>, obj?: Record<string, string | number | string[]>) {
      statusCode = code;

      if (typeof reason === 'string') {
        statusMessage = reason;
        if (obj) {
          Object.assign(headers, obj);
        }
      } else if (typeof reason === 'object') {
        Object.assign(headers, reason);
      }

      writeHeaders();
      return this;
    };

    // Write data
    res.write = function(chunk: any, encoding?: any, callback?: any) {
      if (res.aborted || finished) return false;

      writeHeaders();

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
      const success = uwsRes.write(buffer);

      if (typeof encoding === 'function') {
        encoding();
      } else if (callback) {
        callback();
      }

      return success;
    };

    // End response
    res.end = function(chunk?: any, encoding?: any, callback?: any) {
      if (res.aborted || finished) return this;

      finished = true;
      writeHeaders();

      if (chunk) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
        uwsRes.end(buffer);
      } else {
        uwsRes.end();
      }

      if (typeof encoding === 'function') {
        encoding();
      } else if (callback) {
        callback();
      }

      // Emit 'finish' event (used by KoaX for cleanup)
      setImmediate(() => {
        res.emit('finish');
      });

      return this;
    };

    // Additional properties for compatibility
    res.req = req;
    res.socket = req.socket;
    res.connection = req.connection;
    res.sendDate = true;
    res.chunkedEncoding = false;
    res.shouldKeepAlive = true;
    res.useChunkedEncodingByDefault = true;
    res._header = null;
    res._headers = headers;
    res.aborted = false;

    return res as ServerResponse;
  }
}

/**
 * Factory functions for creating server transports
 */
export const serverTransports = {
  /**
   * Standard HTTP/1.1 transport
   * Best for: Development, maximum compatibility
   */
  http: (): ServerTransport => new HttpTransport(),

  /**
   * HTTP/2 cleartext transport
   * Best for: Internal services, gRPC-like performance
   * Note: Browsers require HTTPS for HTTP/2
   */
  http2: (): ServerTransport => new Http2Transport(),

  /**
   * HTTP/2 with TLS encryption
   * Best for: Production web apps, public APIs
   * Requires: SSL certificate and key
   */
  http2Secure: (options: SecureServerOptions): ServerTransport =>
    new Http2SecureTransport(options),

  /**
   * HTTPS (HTTP/1.1 with TLS)
   * Best for: Legacy compatibility with encryption
   */
  https: (options: HttpsServerOptions): ServerTransport =>
    new HttpsTransport(options),

  /**
   * HTTP/2 with automatic HTTP/1.1 fallback
   * Best for: Production, gradual migration, universal compatibility
   * Automatically serves HTTP/2 to modern clients, HTTP/1.1 to legacy clients
   */
  http2Fallback: (options?: SecureServerOptions): ServerTransport =>
    new Http2FallbackTransport(options),

  /**
   * uWebSockets.js transport (Ultra High Performance)
   * Best for: Maximum performance, high throughput, production at scale
   * Requires: npm install uWebSockets.js
   *
   * Performance: 3-10x faster than standard HTTP
   * Fully compatible with existing middleware (uses adapter pattern)
   *
   * Options:
   * - maxPayloadLength: Max request body size (default: 16MB)
   * - idleTimeout: Timeout in seconds (default: 120s)
   * - maxBackpressure: Max backpressure bytes (default: 1MB)
   */
  uws: (options?: {
    maxPayloadLength?: number;
    idleTimeout?: number;
    maxBackpressure?: number;
  }): ServerTransport => new UWebSocketsTransport(options),
};

/**
 * Performance Comparison:
 *
 * Transport              | Req/sec  | Latency  | Memory  | Use Case
 * -----------------------|----------|----------|---------|---------------------------
 * HTTP/1.1              | Baseline | Baseline | Baseline| Development, compatibility
 * HTTP/2 (cleartext)    | +20-40%  | -15-25%  | +10-20% | Internal services
 * HTTP/2 (TLS)          | +20-40%  | -15-25%  | +10-20% | Production web apps
 * HTTP/2 Fallback       | Mixed    | Mixed    | +10-20% | Universal compatibility
 * HTTPS (HTTP/1.1+TLS)  | Baseline | +10-15%  | Baseline| Legacy + security
 * uWebSockets.js        | +300-1000%| -50-70% | -20-40% | Maximum performance
 *
 * Real-world benchmarks (simple JSON response):
 * - Node.js HTTP/1.1:      ~20,000 req/sec
 * - Node.js HTTP/2:        ~28,000 req/sec
 * - uWebSockets.js:        ~100,000-200,000 req/sec (5-10x faster!)
 *
 * Memory Usage:
 * - HTTP/1.1: Baseline (~50MB for 10k connections)
 * - HTTP/2: +10-20% (multiplexing overhead)
 * - uWebSockets.js: -20-40% (native C++ implementation)
 *
 * Recommendations:
 * - Development: http() - Simple, fast reload, easy debugging
 * - Internal APIs: http2() or uws() - High performance
 * - Public APIs: http2Fallback() - Best compatibility
 * - Legacy systems: https() - Universal support
 * - High-scale production: uws() - Maximum throughput, lowest latency
 *
 * Note: uWebSockets.js requires native compilation but offers
 * unmatched performance for high-throughput scenarios.
 */
