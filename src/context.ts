import { IncomingMessage, ServerResponse } from 'http';
import { KoaXRequest } from './request';
import { KoaXResponse } from './response';
import { KoaXContext } from './types';
import { KoaXApplication } from './application';
import { Logger, generateRequestId } from './logger';

/**
 * Context Pool Manager
 * OPTIMIZATION: Reuses context objects to reduce GC pressure
 *
 * Benefits:
 * - Reduces object allocation per request
 * - Decreases garbage collection frequency
 * - Improves throughput under high load
 */
export class ContextPool {
  private pool: Context[] = [];
  private readonly maxSize: number;
  private created: number = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Acquire a context from the pool or create a new one
   */
  acquire(app: KoaXApplication, req: IncomingMessage, res: ServerResponse): Context {
    let ctx = this.pool.pop();

    if (!ctx) {
      ctx = new Context(app, req, res);
      this.created++;
    } else {
      ctx.reset(app, req, res);
    }

    ctx._inUse = true;
    return ctx;
  }

  /**
   * Release a context back to the pool
   * OPTIMIZATION: Clear references to allow garbage collection of request/response
   */
  release(ctx: Context): void {
    if (!ctx._inUse) return;

    ctx._inUse = false;

    // Only keep up to maxSize contexts in pool
    if (this.pool.length < this.maxSize) {
      // Clear state to prevent memory leaks
      ctx.state = {};
      this.pool.push(ctx);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { poolSize: number; created: number; maxSize: number } {
    return {
      poolSize: this.pool.length,
      created: this.created,
      maxSize: this.maxSize
    };
  }
}

/**
 * Context class - encapsulates request and response
 * Compatible with Koa's Context interface
 */
export class Context implements KoaXContext {
  app!: KoaXApplication;
  req!: IncomingMessage;
  res!: ServerResponse;
  request!: KoaXRequest;
  response!: KoaXResponse;
  state: Record<string, any> = {};
  _inUse?: boolean;

  // NEW: Logger and timing
  log!: Logger;
  requestId!: string;
  startTime!: number;

  constructor(app: KoaXApplication, req: IncomingMessage, res: ServerResponse) {
    this.request = new KoaXRequest(req);
    this.response = new KoaXResponse(res);
    this.reset(app, req, res);
  }

  /**
   * Reset context for reuse from pool
   * OPTIMIZATION: Reuse existing objects instead of creating new ones
   */
  reset(app: KoaXApplication, req: IncomingMessage, res: ServerResponse): void {
    this.app = app;
    this.req = req;
    this.res = res;
    this.request.reset(req);
    this.response.reset(res);
    this.state = {};

    // NEW: Initialize logger and timing for this request
    this.requestId = generateRequestId();
    this.startTime = Date.now();

    // Create child logger with request context
    this.log = app.logger.child({
      reqId: this.requestId,
      method: req.method,
      url: req.url
    });
  }

  // Delegated properties from request
  get url(): string {
    return this.request.url;
  }

  set url(val: string) {
    this.request.url = val;
  }

  get method(): string {
    return this.request.method;
  }

  set method(val: string) {
    this.request.method = val;
  }

  get path(): string {
    return this.request.path;
  }

  set path(val: string) {
    this.request.path = val;
  }

  get query(): Record<string, string> {
    return this.request.query;
  }

  get headers(): Record<string, string | string[] | undefined> {
    return this.request.headers;
  }

  // Delegated properties from response
  get status(): number {
    return this.response.status;
  }

  set status(code: number) {
    this.response.status = code;
  }

  get message(): string {
    return this.response.message;
  }

  set message(msg: string) {
    this.response.message = msg;
  }

  get body(): any {
    return this.response.body;
  }

  set body(val: any) {
    this.response.body = val;
  }

  /**
   * Set response header
   */
  set(field: string, val: string | string[]): void {
    this.response.set(field, val);
  }

  /**
   * Get response header
   */
  get(field: string): string | number | string[] | undefined {
    return this.response.get(field);
  }

  /**
   * Throw an HTTP error
   */
  throw(status: number, message?: string): never {
    const err: any = new Error(message || `HTTP Error ${status}`);
    err.status = status;
    err.expose = true;
    throw err;
  }

  /**
   * Assert a condition, throw if false
   */
  assert(condition: any, status: number, message?: string): asserts condition {
    if (!condition) {
      this.throw(status, message);
    }
  }
}
