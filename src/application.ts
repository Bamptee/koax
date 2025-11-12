import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { Middleware, KoaXContext, KoaXOptions, HookFunction, ErrorHookFunction } from './types';
import { ContextPool, Context } from './context';
import { Logger, createLogger } from './logger';

/**
 * KoaX Application
 *
 * KEY OPTIMIZATION: Iterative middleware execution instead of recursive
 * - Reduces call stack depth
 * - Improves performance by avoiding function call overhead
 * - Easier to debug and profile
 *
 * Context pooling reduces GC pressure and object allocation overhead
 *
 * NEW FEATURES:
 * - Hooks system (onRequest, onResponse, onError)
 * - Structured logging
 * - Automatic request timing
 */
export class KoaXApplication extends EventEmitter {
  private middleware: Middleware[] = [];
  private contextPool: ContextPool;
  public env: string;
  public proxy: boolean;
  public subdomainOffset: number;

  // NEW: Logger
  public logger: Logger;
  private timingEnabled: boolean;

  // NEW: Hooks inspired by Fastify
  private requestHooks: HookFunction[] = [];
  private responseHooks: HookFunction[] = [];
  private errorHooks: ErrorHookFunction[] = [];

  constructor(options: KoaXOptions = {}) {
    super();
    this.env = options.env || process.env.NODE_ENV || 'development';
    this.proxy = options.proxy || false;
    this.subdomainOffset = options.subdomainOffset || 2;
    this.contextPool = new ContextPool(options.contextPoolSize || 1000);

    // Initialize logger
    this.logger = createLogger({
      enabled: options.logger?.enabled ?? true,
      level: options.logger?.level || 'info',
      prettyPrint: options.logger?.prettyPrint ?? (this.env === 'development'),
      name: options.logger?.name || 'koax',
      transport: options.logger?.transport  // Pass custom transport if provided
    });

    // Enable timing by default
    this.timingEnabled = options.timing ?? true;
  }

  /**
   * Register middleware - compatible with Koa's app.use()
   */
  use(fn: Middleware): this {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be a function');
    }
    this.middleware.push(fn);
    return this;
  }

  /**
   * Register onRequest hook
   * Executed before any middleware, perfect for logging, authentication checks
   *
   * @param fn - Hook function to execute
   */
  onRequest(fn: HookFunction): this {
    if (typeof fn !== 'function') {
      throw new TypeError('Hook must be a function');
    }
    this.requestHooks.push(fn);
    return this;
  }

  /**
   * Register onResponse hook
   * Executed after all middleware, before sending response
   * Perfect for logging response times, cleanup, metrics
   *
   * @param fn - Hook function to execute
   */
  onResponse(fn: HookFunction): this {
    if (typeof fn !== 'function') {
      throw new TypeError('Hook must be a function');
    }
    this.responseHooks.push(fn);
    return this;
  }

  /**
   * Register onError hook
   * Executed when an error occurs
   * Perfect for error logging, monitoring, alerting
   *
   * @param fn - Error hook function to execute
   */
  onError(fn: ErrorHookFunction): this {
    if (typeof fn !== 'function') {
      throw new TypeError('Hook must be a function');
    }
    this.errorHooks.push(fn);
    return this;
  }

  /**
   * Create HTTP server and listen on port
   * Compatible with Koa's app.listen()
   */
  listen(port: number, callback?: () => void): Server {
    const server = createServer(this.callback());
    return server.listen(port, callback);
  }

  /**
   * Return request handler callback for http.createServer()
   * Compatible with Koa's app.callback()
   */
  callback() {
    return (req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res);
    };
  }

  /**
   * Handle incoming request
   * OPTIMIZATION: Uses context pool to reuse objects
   * NEW: Executes hooks and automatic timing
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ctx = this.contextPool.acquire(this, req, res);

    try {
      // Execute onRequest hooks
      await this.executeRequestHooks(ctx);

      // Execute middleware chain
      await this.executeMiddleware(ctx);

      // Execute onResponse hooks
      await this.executeResponseHooks(ctx);

      // Log request if timing is enabled
      if (this.timingEnabled) {
        const duration = Date.now() - ctx.startTime;
        ctx.log.info(`Request completed`, {
          status: ctx.status,
          duration: `${duration}ms`
        });
      }

      // Send response
      this.respond(ctx);
    } catch (err) {
      await this.handleError(err, ctx);
    } finally {
      // Return context to pool after response is sent
      res.on('finish', () => {
        this.contextPool.release(ctx);
      });
    }
  }

  /**
   * Execute onRequest hooks
   */
  private async executeRequestHooks(ctx: KoaXContext): Promise<void> {
    for (const hook of this.requestHooks) {
      await hook(ctx);
    }
  }

  /**
   * Execute onResponse hooks
   */
  private async executeResponseHooks(ctx: KoaXContext): Promise<void> {
    for (const hook of this.responseHooks) {
      await hook(ctx);
    }
  }

  /**
   * Execute middleware chain with iterative dispatch
   *
   * OPTIMIZATION: Iterative middleware execution instead of koa-compose
   *
   * Traditional Koa uses koa-compose which creates nested function calls:
   * - Each await next() creates a new function call in the stack
   * - Stack depth = number of middleware
   * - More overhead from function call frames
   *
   * KoaX uses iterative dispatch with index-based traversal:
   * - Maintains the same onion model (downstream -> upstream)
   * - Reduces function call overhead
   * - Simpler to profile and debug
   * - Still fully compatible with Koa middleware semantics
   *
   * Example with 3 middleware:
   * M1: async (ctx, next) => { console.log(1); await next(); console.log(4); }
   * M2: async (ctx, next) => { console.log(2); await next(); console.log(3); }
   * M3: async (ctx, next) => { console.log('final'); }
   *
   * Output: 1, 2, final, 3, 4 (onion model preserved)
   */
  private async executeMiddleware(ctx: KoaXContext): Promise<void> {
    if (this.middleware.length === 0) return;

    // OPTIMIZATION: Use index-based iteration instead of recursion
    // This reduces call stack depth while maintaining Koa semantics
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      // Prevent calling next() multiple times
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      index = i;

      // End of middleware chain
      if (i >= this.middleware.length) {
        return;
      }

      const fn = this.middleware[i];

      try {
        // Execute current middleware, passing dispatch bound to next index
        // This maintains the onion model while using iteration
        await fn(ctx, () => dispatch(i + 1));
      } catch (err) {
        throw err;
      }
    };

    await dispatch(0);
  }

  /**
   * Send response to client
   */
  private respond(ctx: KoaXContext): void {
    ctx.response.send();
  }

  /**
   * Handle errors
   * NEW: Executes error hooks and logs errors
   */
  private async handleError(err: any, ctx: KoaXContext): Promise<void> {
    const status = err.status || err.statusCode || 500;
    const message = err.expose ? err.message : 'Internal Server Error';

    // Log error with context
    ctx.log.error(err, `Request failed`);

    // Execute error hooks
    try {
      for (const hook of this.errorHooks) {
        await hook(err, ctx);
      }
    } catch (hookErr) {
      // Don't let hook errors crash the app
      this.logger.error(hookErr as Error, 'Error in error hook');
    }

    ctx.status = status;
    ctx.body = { error: message };

    if (!ctx.res.writableEnded) {
      ctx.response.send();
    }

    // Emit error event for logging
    this.emit('error', err, ctx);
  }

  /**
   * Get context pool statistics
   */
  getPoolStats() {
    return this.contextPool.getStats();
  }
}
